import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = [
  "Domain Config",
  "User Mapping",
  "Validate",
  "Migration Mode",
  "Execute",
  "Logs & Reports",
];

interface StepIndicatorProps {
  currentStep: number;
  onStepClick: (step: number) => void;
}

const StepIndicator = ({ currentStep, onStepClick }: StepIndicatorProps) => {
  return (
    <div className="flex items-center justify-between w-full max-w-3xl mx-auto mb-8">
      {steps.map((label, i) => {
        const isCompleted = i < currentStep;
        const isActive = i === currentStep;
        return (
          <div key={i} className="flex items-center flex-1 last:flex-none">
            <button
              onClick={() => isCompleted && onStepClick(i)}
              className={cn(
                "flex flex-col items-center gap-1.5 group",
                isCompleted && "cursor-pointer"
              )}
              disabled={!isCompleted}
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all border-2",
                  isCompleted && "bg-success border-success text-success-foreground",
                  isActive && "bg-primary border-primary text-primary-foreground shadow-md shadow-primary/30",
                  !isCompleted && !isActive && "border-muted-foreground/30 text-muted-foreground"
                )}
              >
                {isCompleted ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span
                className={cn(
                  "text-xs font-medium whitespace-nowrap",
                  isActive ? "text-primary" : isCompleted ? "text-success" : "text-muted-foreground"
                )}
              >
                {label}
              </span>
            </button>
            {i < steps.length - 1 && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-2 mt-[-1rem]",
                  i < currentStep ? "bg-success" : "bg-border"
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

export default StepIndicator;
