import { Frame } from "@/components/nurui/frame";
import { twMerge } from "tailwind-merge";
import { cva, type VariantProps } from "class-variance-authority";

// 🎨 Colors aligned with app theme (CSS variables)
const COLORS = {
  default: {
    // Use theme primary and subtle mixes for fills so it blends anywhere
    stroke1: "var(--primary)",
    fill1: "color-mix(in srgb, var(--primary) 20%, transparent)",
    stroke2: "var(--primary)",
    fill2: "color-mix(in srgb, var(--primary) 10%, transparent)",
    text: "var(--foreground)",
  },
  accent: {
    stroke1: "#f97316",
    fill1: "rgba(249,115,22,0.4)",
    stroke2: "#f97316",
    fill2: "rgba(249,115,22,0.2)",
    text: "#ffffff",
  },
  destructive: {
    stroke1: "#dc2626",
    fill1: "rgba(220,38,38,0.22)",
    stroke2: "#dc2626",
    fill2: "rgba(220,38,38,0.1)",
    text: "#ffffff",
  },
  secondary: {
    stroke1: "#64748b",
    fill1: "rgba(100,116,139,0.15)",
    stroke2: "#64748b",
    fill2: "rgba(100,116,139,0.1)",
    text: "#ffffff",
  },
  success: {
    stroke1: "#16a34a",
    fill1: "rgba(22,163,74,0.22)",
    stroke2: "#16a34a",
    fill2: "rgba(22,163,74,0.1)",
    text: "#ffffff",
  },
};

const buttonVariants = cva(
  "group font-bold mb-2 relative px-8 py-2 cursor-pointer transition-all duration-300 will-change-transform hover:-translate-y-[1px] active:translate-y-0 outline-none [&>span]:relative [&>span]:flex [&>span]:items-center [&>span]:justify-center",
  {
    variants: {
      shape: {
        default: "",
        flat: "",
        simple: "ps-8 pe-6",
      },
    },
    defaultVariants: {
      shape: "default",
    },
  },
);

function FutureButton({
  className,
  children,
  shape = "default",
  enableBackdropBlur = false,
  enableViewBox = false,
  customPaths,
  textColor,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    customPaths?: string[];
    enableBackdropBlur?: boolean;
    enableViewBox?: boolean;
    bgColor?: string;
    textColor?: string;
  }) {
  const colors = COLORS.default;

  return (
    <button
      {...props}
      style={{
        color: textColor || colors.text,
      }}
      className={twMerge(buttonVariants({ shape, className }))}
    >
      {/* soft glow on hover */}
      <div
        aria-hidden
        className="absolute -inset-[0.35rem] rounded-[0.9rem] opacity-0 group-hover:opacity-100 transition-opacity duration-300 blur-md pointer-events-none"
        style={{
          background:
            "radial-gradient(60% 80% at 50% 50%, color-mix(in srgb, var(--primary) 24%, transparent), transparent 60%)",
        }}
      />
      <div className="absolute inset-0 -mb-2">
        {!customPaths && (shape === "default" || shape === "flat") && (
          <Frame
            enableBackdropBlur={enableBackdropBlur}
            enableViewBox={enableViewBox}
            paths={[
              {
                show: true,
                style: {
                  strokeWidth: "1",
                  stroke: colors.stroke1,
                  fill: colors.fill1,
                },
                path: [
                  ["M", "17", "0"],
                  ["L", "100% - 7", "0"],
                  ["L", "100% + 0", "0% + 9.5"],
                  ["L", "100% - 18", "100% - 6"],
                  ["L", "4", "100% - 6"],
                  ["L", "0", "100% - 15"],
                  ["L", "17", "0"],
                ],
              },
              {
                show: true,
                style: {
                  strokeWidth: "1",
                  stroke: colors.stroke2,
                  fill: colors.fill2,
                },
                path: [
                  ["M", "9", "100% - 6"],
                  ["L", "100% - 22", "100% - 6"],
                  ["L", "100% - 25", "100% + 0"],
                  ["L", "12", "100% + 0"],
                  ["L", "9", "100% - 6"],
                ],
              },
            ]}
          />
        )}

        {!customPaths && shape === "simple" && (
          <Frame
            enableBackdropBlur={enableBackdropBlur}
            enableViewBox={enableViewBox}
            paths={[
              {
                show: true,
                style: {
                  strokeWidth: "1",
                  stroke: colors.stroke1,
                  fill: colors.fill1,
                },
                path: [
                  ["M", "17", "0"],
                  ["L", "100% - 0", "0"],
                  ["L", "100% - 0", "100% - 6"],
                  ["L", "0% + 3", "100% - 6"],
                  ["L", "0% - 0", "100% - 16"],
                  ["L", "17", "0"],
                ],
              },
              {
                show: true,
                style: {
                  strokeWidth: "1",
                  stroke: colors.stroke2,
                  fill: colors.fill2,
                },
                path: [
                  ["M", "8", "100% - 6"],
                  ["L", "100% - 5", "100% - 6"],
                  ["L", "100% - 7", "100% - 0"],
                  ["L", "10", "100% - 0"],
                  ["L", "8", "100% - 6"],
                ],
              },
            ]}
          />
        )}

        {customPaths?.map((customPath, i) => (
          <Frame key={i} paths={JSON.parse(customPath)} />
        ))}
      </div>
      <span>{children}</span>
    </button>
  );
}

export default FutureButton;
