import crypto from 'node:crypto';
import https from 'node:https';
import { HttpsProxyAgent } from 'https-proxy-agent';

const BASE_URL = 'https://api.digiflazz.com/v1';

type DigiflazzData = {
  ref_id: string;
  customer_no: string;
  buyer_sku_code: string;
  message?: string;
  status: string;
  rc?: string;
  sn?: string;
  price?: number;
  buyer_last_saldo?: number;
  [key: string]: unknown;
};

function config() {
  const username = process.env.DIGIFLAZZ_USERNAME;
  const apiKey = process.env.DIGIFLAZZ_API_KEY;
  if (!username || !apiKey) throw new Error('DIGIFLAZZ_NOT_CONFIGURED');
  return { username, apiKey };
}

function sign(additional: string) {
  const { username, apiKey } = config();
  return crypto.createHash('md5').update(username + apiKey + additional).digest('hex');
}

function getProxyAgent() {
  const proxyUrl = process.env.DIGIFLAZZ_PROXY_URL;
  if (!proxyUrl) throw new Error('DIGIFLAZZ_PROXY_URL_NOT_CONFIGURED');
  return new HttpsProxyAgent(proxyUrl);
}

// Memakai node:https (bukan fetch) karena fetch bawaan Next.js mengabaikan "agent",
// sehingga request tidak lewat proxy dan IP yang terlihat provider adalah IP Vercel.
function post(path: string, body: Record<string, unknown>) {
  return new Promise<{ data: DigiflazzData | DigiflazzData[] }>((resolve, reject) => {
    const payload = JSON.stringify(body);
    const url = new URL(`${BASE_URL}${path}`);
    const req = https.request(
      {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        agent: getProxyAgent(),
        timeout: 25000,
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          let json: any = null;
          try {
            json = JSON.parse(Buffer.concat(chunks).toString('utf8'));
          } catch {
            json = null;
          }
          const status = res.statusCode || 0;
          if (status < 200 || status >= 300) {
            reject(new Error(json?.data?.message || `DIGIFLAZZ_HTTP_${status}`));
            return;
          }
          resolve(json as { data: DigiflazzData | DigiflazzData[] });
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error('DIGIFLAZZ_TIMEOUT')));
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

export async function getPrepaidPriceList() {
  const { username } = config();
  return post('/price-list', { cmd: 'prepaid', username, sign: sign('pricelist') });
}

export async function getPostpaidPriceList() {
  const { username } = config();
  return post('/price-list', { cmd: 'pasca', username, sign: sign('pricelist') });
}

export async function topupPrepaid(input: {
  sku: string;
  customerNo: string;
  refId: string;
  maxPrice?: number;
}) {
  const { username } = config();
  return post('/transaction', {
    username,
    buyer_sku_code: input.sku,
    customer_no: input.customerNo,
    ref_id: input.refId,
    sign: sign(input.refId),
    ...(input.maxPrice ? { max_price: input.maxPrice } : {}),
    ...(process.env.DIGIFLAZZ_TESTING === 'true' ? { testing: true } : {}),
  });
}

export async function inquiryPostpaid(input: {
  sku: string;
  customerNo: string;
  refId: string;
  extra?: Record<string, unknown>;
}) {
  const { username } = config();
  return post('/transaction', {
    commands: 'inq-pasca',
    username,
    buyer_sku_code: input.sku,
    customer_no: input.customerNo,
    ref_id: input.refId,
    sign: sign(input.refId),
    ...(process.env.DIGIFLAZZ_TESTING === 'true' ? { testing: true } : {}),
    ...(input.extra || {}),
  });
}

export async function payPostpaid(input: {
  sku: string;
  customerNo: string;
  refId: string;
}) {
  const { username } = config();
  return post('/transaction', {
    commands: 'pay-pasca',
    username,
    buyer_sku_code: input.sku,
    customer_no: input.customerNo,
    ref_id: input.refId,
    sign: sign(input.refId),
    ...(process.env.DIGIFLAZZ_TESTING === 'true' ? { testing: true } : {}),
  });
}

export function verifyWebhookSignature(rawBody: string, header: string | null) {
  const secret = process.env.DIGIFLAZZ_WEBHOOK_SECRET;
  if (!secret) return process.env.NODE_ENV !== 'production';
  if (!header?.startsWith('sha1=')) return false;
  const expected = crypto.createHmac('sha1', secret).update(rawBody).digest('hex');
  const supplied = header.slice(5);
  return supplied.length === expected.length && crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}