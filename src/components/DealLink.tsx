"use client";

// Two-element deal link pattern used everywhere a deal is listed.
// - The name is a <button> that opens the drill-down drawer.
// - The ↗ is a separate <a target="_blank"> that jumps to HubSpot.
// They are siblings, not nested — keeping the two actions visually and
// semantically distinct.

const HUBSPOT_BASE = "https://app.hubspot.com/contacts/3282655/record/0-3";

interface Props {
  dealId: string;
  dealName: string;
  onOpenDeal?: (id: string) => void;
  // Tailwind utility classes applied to the name button so callers can
  // match their existing row typography.
  className?: string;
  // Tailwind classes for the wrapping span (flex spacing, truncation, etc.)
  wrapperClassName?: string;
  // Show the external-link icon. Defaults to true.
  showExternal?: boolean;
}

export function DealLink({
  dealId,
  dealName,
  onOpenDeal,
  className = "",
  wrapperClassName = "",
  showExternal = true,
}: Props) {
  return (
    <span className={`inline-flex items-center gap-1 min-w-0 ${wrapperClassName}`}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          if (onOpenDeal) onOpenDeal(dealId);
        }}
        className={`text-left truncate cursor-pointer bg-transparent border-0 p-0 m-0 font-inherit ${className}`}
        title="Open deal details"
      >
        {dealName}
      </button>
      {showExternal && (
        <a
          href={`${HUBSPOT_BASE}/${dealId}`}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="shrink-0 text-[var(--text-muted)] hover:text-[var(--accent-blue)] transition-colors leading-none text-[10px]"
          title="Open in HubSpot (new tab)"
          aria-label={`Open ${dealName} in HubSpot`}
        >
          ↗
        </a>
      )}
    </span>
  );
}
