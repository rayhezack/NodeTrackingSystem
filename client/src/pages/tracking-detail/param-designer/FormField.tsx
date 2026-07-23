import type { ReactNode } from 'react';
import { Label } from '@client/src/components/ui/label';

interface FormFieldProps {
  label: string;
  required?: boolean;
  children: ReactNode;
  className?: string;
}

const FormField = ({ label, required, children, className = '' }: FormFieldProps) => {
  return (
    <div className={`space-y-1.5 ${className}`}>
      <Label className="text-xs">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </Label>
      {children}
    </div>
  );
};

export default FormField;
