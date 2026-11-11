type SectionHeadingProps = {
  /** Small uppercase eyebrow label above the title. */
  eyebrow: string;
  /** Section title. */
  title: string;
  /** Colour utility for the eyebrow (defaults to the primary token). */
  eyebrowClass?: string;
  /** Show a leading status dot in the eyebrow. */
  showDot?: boolean;
  /** Optional supporting sentence below the title. */
  description?: string;
};

/**
 * Shared eyebrow + title (+ optional description) block used by landing sections.
 */
function SectionHeading({
  eyebrow,
  title,
  eyebrowClass = "text-primary",
  showDot = false,
  description,
}: SectionHeadingProps) {
  return (
    <div className="text-left">
      <span
        className={`font-label-sm text-label-sm uppercase tracking-wider font-bold flex items-center gap-1 ${eyebrowClass}`}
      >
        {showDot && <span className="w-1.5 h-1.5 rounded-full bg-error" />}
        {eyebrow}
      </span>
      <h2 className="font-headline-lg-mobile text-headline-lg-mobile text-on-surface font-bold tracking-tight">
        {title}
      </h2>
      {description && (
        <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2xs font-medium">
          {description}
        </p>
      )}
    </div>
  );
}

export default SectionHeading;
