
import { useId } from "react";

import { useCountUp } from "../../hooks/useCountUp";
import MaterialIcon from "../landing/MaterialIcon";

/** One compliance track shown as a horizontal bar. */
export type ComplianceMetric = {
  /** Track name, e.g. "FIRA Bank Match". */
  label: string;
  /** Formatted score, e.g. "98.0%". */
  value: string;
  /** Bar fill width as a percentage (0-100). */
  percent: number;
  /** Background class for the filled bar. */
  barClass: string;
};

export type ComplianceHealthCardProps = {
  /** Overall audit-ready score, e.g. "94.8". */
  score: string;
  /** Caption under the score, e.g. "Audit Ready". */
  scoreLabel: string;
  /** Trend pill label, e.g. "+3.2% vs Q2". */
  deltaLabel: string;
  /** Per-track breakdown bars. */
  metrics: ComplianceMetric[];
};

/**
 * Modern compliance health card.
 *
 * Features:
 * - Single gradient circular progress indicator.
 * - Animated overall compliance score.
 * - Clean metric breakdown with individual progress bars.
 * - Responsive layout and improved visual hierarchy.
 */
function ComplianceHealthCard({
  score,
  scoreLabel,
  deltaLabel,
  metrics,
}: ComplianceHealthCardProps) {
  const gradientId = `compliance-gradient-${useId().replace(/:/g, "")}`;

  // Parse and validate the overall score.
  const parsedScore = Number.parseFloat(score);

  const targetScore = Number.isFinite(parsedScore)
    ? Math.min(100, Math.max(0, parsedScore))
    : 0;

  const fraction = score.split(".")[1];
  const decimals = fraction ? fraction.length : 0;

  const animatedScore = useCountUp(targetScore, {
    decimals,
    durationMs: 1200,
  });

  // Circular progress calculations.
  const radius = 46;
  const circumference = 2 * Math.PI * radius;

  const progress = Math.min(
    100,
    Math.max(0, animatedScore)
  );

  const progressOffset =
    circumference * (1 - progress / 100);

  return (
    <div className="
      flex h-full flex-col gap-5
      rounded-[20px]
      bg-surface-container-lowest
      p-5 card-hover
      shadow-md
      transition-all duration-300
      hover:-translate-y-1 hover:shadow-xl
    ">

      {/* Header */}
      <div className="flex items-center justify-between gap-3">

        <div className="flex min-w-0 items-center gap-3">

          <div className="
            flex h-10 w-10 shrink-0
            items-center justify-center
            rounded-xl bg-primary/10
          ">
            <MaterialIcon
              name="shield_with_heart"
              className="text-[21px] text-primary"
            />
          </div>

          <div className="flex min-w-0 flex-col">
            <span className="
              truncate font-headline-sm
              text-headline-sm text-on-surface
            ">
              Compliance Health
            </span>

            <span className="
              text-[11px] font-medium
              text-on-surface-variant
            ">
              Overall compliance score
            </span>
          </div>

        </div>

        <span className="
          inline-flex shrink-0 items-center gap-1.5
          rounded-full bg-emerald-50
          px-3 py-1.5
          text-xs font-semibold text-emerald-700
        ">
          <MaterialIcon
            name="trending_up"
            className="text-[14px]"
          />
          {deltaLabel}
        </span>

      </div>

      {/* Main content */}
      <div className="
        grid min-w-0 flex-1
        grid-cols-[132px_minmax(0,1fr)]
        items-center gap-5
      ">

        {/* Overall compliance score */}
        <div className="
          relative mx-auto flex
          h-[132px] w-[132px]
          shrink-0 items-center justify-center
        ">

          <svg
            viewBox="0 0 120 120"
            className="h-full w-full -rotate-90"
            role="img"
            aria-label={`Compliance score: ${animatedScore.toFixed(decimals)} percent`}
          >

            <defs>
              <linearGradient
                id={gradientId}
                x1="0%"
                y1="0%"
                x2="100%"
                y2="100%"
              >
                <stop offset="0%" stopColor="#4338CA" />
                <stop offset="100%" stopColor="#0D9488" />
              </linearGradient>
            </defs>

            {/* Background track */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="currentColor"
              strokeWidth="8"
              className="text-surface-container"
            />

            {/* Animated progress */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke={`url(#${gradientId})`}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={progressOffset}
              className="transition-all duration-1000 ease-out"
            />

          </svg>

          {/* Score content */}
          <div className="
            absolute inset-0
            flex flex-col items-center justify-center
            text-center
          ">

            <div className="flex items-baseline justify-center">

              <span className="
                text-[34px] font-bold
                leading-none tracking-tight
                tabular-nums text-on-surface
              ">
                {animatedScore.toFixed(decimals)}
              </span>

              <span className="
                ml-0.5 text-sm font-semibold
                text-on-surface-variant
              ">
                %
              </span>

            </div>

            <span className="
              mt-2 max-w-[105px]
              truncate text-[10px]
              font-semibold tracking-wide
              text-emerald-700
            ">
              {scoreLabel}
            </span>

          </div>

        </div>

        {/* Individual compliance metrics */}
        <div className="
          flex min-w-0 flex-col
          justify-center gap-5
        ">

          {metrics.map((metric) => {

            const metricProgress = Number.isFinite(metric.percent)
              ? Math.min(100, Math.max(0, metric.percent))
              : 0;

            return (
              <div
                key={metric.label}
                className="flex min-w-0 flex-col gap-2"
              >

                {/* Metric label and value */}
                <div className="
                  flex min-w-0 items-center
                  justify-between gap-2
                ">

                  <span className="
                    min-w-0 truncate
                    text-[12px] font-medium
                    text-on-surface-variant
                  ">
                    {metric.label}
                  </span>

                  <span className="
                    shrink-0 text-[12px]
                    font-semibold tabular-nums
                    text-on-surface
                  ">
                    {metric.value}
                  </span>

                </div>

                {/* Progress bar */}
                <div
                  className="
                    h-[5px] w-full
                    overflow-hidden rounded-full
                    bg-surface-container
                  "
                  role="progressbar"
                  aria-label={metric.label}
                  aria-valuenow={metricProgress}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >

                  <div
                    className={`
                      h-full rounded-full
                      bar-fill
                      ${metric.barClass}
                      transition-all duration-700 ease-out
                    `}
                    style={{
                      width: `${metricProgress}%`,
                    }}
                  />

                </div>

              </div>
            );
          })}

        </div>

      </div>

    </div>
  );
}

export default ComplianceHealthCard;
