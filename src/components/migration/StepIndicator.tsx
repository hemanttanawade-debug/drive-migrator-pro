import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  "Domain Config",
  "Validation",
  "User Mapping",
  "Migration Mode",
  "Execute",
];

interface StepIndicatorProps {
  currentStep: number;
  maxAccessibleStep: number;
  completedSteps: number[];
  onStepClick: (step: number) => void;
}

const StepIndicator = ({ currentStep, maxAccessibleStep, completedSteps, onStepClick }: StepIndicatorProps) => {
  return (
    <div className="mb-8 rounded-3xl border border-border/70 bg-surface/80 px-4 py-5 shadow-soft backdrop-blur-sm">
      <div className="flex items-center justify-between w-full max-w-4xl mx-auto">
      {steps.map((label, i) => {
        const isCompleted = completedSteps.includes(i);
        const isActive = i === currentStep;
        const isAccessible = i <= maxAccessibleStep;

        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => isAccessible && onStepClick(i)}
              className={cn(
                "flex flex-col items-center gap-1.5 group",
                isAccessible && "cursor-pointer"
              )}
              disabled={!isAccessible}
            >
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold transition-all border-2",
                  isCompleted && "bg-success border-success text-success-foreground",
                  isActive && "bg-primary border-primary text-primary-foreground shadow-brand",
                  !isCompleted && !isActive && isAccessible && "border-primary/25 bg-primary/5 text-primary",
                  !isAccessible && "border-muted-foreground/20 text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isActive ? "text-primary" : isCompleted ? "text-success" : isAccessible ? "text-foreground" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 mt-[-1rem]",
                  completedSteps.includes(i) ? "bg-success" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
      </div>
    </div>
  );
};

export default StepIndicator;
