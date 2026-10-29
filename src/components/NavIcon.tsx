type IconName = "home" | "grid" | "wallet" | "receipt" | "menu" | "person" | "document" | "question" | "bell" | "megaphone" | "star";

export default function NavIcon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  const props = {
    className,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "home":
      return (
        <svg {...props}>
          <path d="M3 10.5 12 3l9 7.5" />
          <path d="M5 9.5V21h14V9.5" />
          <path d="M9.5 21v-5.5h5V21" />
        </svg>
      );
    case "grid":
      return (
        <svg {...props}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="3.5" width="7" height="7" rx="2" />
          <rect x="3.5" y="13.5" width="7" height="7" rx="2" />
          <rect x="13.5" y="13.5" width="7" height="7" rx="2" />
        </svg>
      );
    case "wallet":
      return (
        <svg {...props}>
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z" />
          <path d="M4 8.5h16" />
          <path d="M15 13h4" />
        </svg>
      );
    case "receipt":
      return (
        <svg {...props}>
          <path d="M6 3h12v18l-2.5-1.8L13 21l-2.5-1.8L8 21l-2-1.5z" />
          <path d="M9 8h6" />
          <path d="M9 12h6" />
        </svg>
      );
    case "menu":
      return (
        <svg {...props}>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </svg>
      );
    case "person":
      return (
        <svg {...props}>
          <circle cx="12" cy="8" r="3.6" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "document":
      return (
        <svg {...props}>
          <path d="M6.5 3.5H13l5 5v12h-11.5z" />
          <path d="M13 3.5V9h5" />
          <path d="M9.5 13h5" />
          <path d="M9.5 16.5h5" />
        </svg>
      );
    case "question":
      return (
        <svg {...props}>
          <path d="M20.5 12c0 3.9-3.8 7-8.5 7-1 0-2-.15-2.9-.42L4.5 20.5l1.5-3.4A6.6 6.6 0 0 1 3.5 12c0-3.9 3.8-7 8.5-7s8.5 3.1 8.5 7z" />
          <path d="M9.8 10.1a2.4 2.4 0 0 1 4.6.9c0 1.6-2.3 1.8-2.3 3.2" />
          <path d="M12 16.4v.6" />
        </svg>
      );
    case "bell":
      return (
        <svg {...props}>
          <path d="M7 10a5 5 0 0 1 10 0c0 3.8 1.2 4.9 1.7 5.6.3.5 0 1.1-.6 1.1H5.9c-.6 0-.9-.6-.6-1.1.5-.7 1.7-1.8 1.7-5.6z" />
          <path d="M10.2 19.2a2 2 0 0 0 3.6 0" />
        </svg>
      );
    case "megaphone":
      return (
        <svg {...props}>
          <path d="M4 10v4h3l5 3.4V6.6L7 10H4z" />
          <path d="M15.5 9.5a3.6 3.6 0 0 1 0 5" />
          <path d="M18 7a7 7 0 0 1 0 10" />
        </svg>
      );
    case "star":
      return (
        <svg {...props}>
          <path d="m12 4.5 2.3 4.6 5.1.8-3.7 3.6.9 5.1-4.6-2.4-4.6 2.4.9-5.1-3.7-3.6 5.1-.8z" />
        </svg>
      );
  }
}
