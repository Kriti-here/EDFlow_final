type MaterialIconProps = {
  /** Material Symbols glyph name, e.g. "menu" or "arrow_downward". */
  name: string;
  /** Extra utility classes (size, colour) applied to the icon span. */
  className?: string;
};

/**
 * Renders a Google "Material Symbols Outlined" glyph.
 * Reused across every landing section so icon styling stays consistent.
 */
function MaterialIcon({ name, className = "" }: MaterialIconProps) {
  return <span className={`material-symbols-outlined ${className}`}>{name}</span>;
}

export default MaterialIcon;
