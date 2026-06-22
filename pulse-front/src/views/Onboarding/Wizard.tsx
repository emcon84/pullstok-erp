import { useState } from "react";
import { CheckIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Industry } from "../../services/onboardingService";
import { StepBusiness } from "./StepBusiness";
import { StepCategories } from "./StepCategories";
import { StepProducts } from "./StepProducts";

const STEPS = [
  { id: 1, title: "Tu negocio" },
  { id: 2, title: "Categorías" },
  { id: 3, title: "Productos" },
] as const;

export const Wizard = () => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [industry, setIndustry] = useState<Industry | null>(null);

  const goToStep2 = (chosenIndustry: Industry) => {
    setIndustry(chosenIndustry);
    setStep(2);
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Bienvenido a Pulse
        </h1>
        <p className="text-sm text-muted-foreground">
          Completá estos pasos para empezar a usar el sistema
        </p>
      </div>

      <ol className="flex items-center justify-center gap-2">
        {STEPS.map((s, idx) => (
          <li key={s.id} className="flex items-center gap-2">
            <div
              className={cn(
                "flex size-8 items-center justify-center rounded-full border text-sm font-medium",
                step === s.id
                  ? "border-primary bg-primary text-primary-foreground"
                  : step > s.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-input text-muted-foreground",
              )}
            >
              {step > s.id ? <CheckIcon className="size-4" /> : s.id}
            </div>
            <span
              className={cn(
                "hidden text-sm sm:inline",
                step === s.id ? "font-medium" : "text-muted-foreground",
              )}
            >
              {s.title}
            </span>
            {idx < STEPS.length - 1 && (
              <div className="h-px w-8 bg-border sm:w-12" />
            )}
          </li>
        ))}
      </ol>

      {step === 1 && <StepBusiness onNext={goToStep2} />}
      {step === 2 && industry && (
        <StepCategories
          industry={industry}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
        />
      )}
      {step === 3 && <StepProducts onBack={() => setStep(2)} />}
    </div>
  );
};
