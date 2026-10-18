import { InputHTMLAttributes, forwardRef, useId } from 'react';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, helperText, id, className = '', ...props }, ref) => {
    const generatedId = useId();
    const inputId = id || props.name || generatedId;
    const errorId = `${inputId}-error`;
    const helperId = `${inputId}-helper`;

    return (
      <div className="w-full space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-medium text-slate-300"
          >
            {label}
            {props.required && <span className="text-red-400 ml-1">*</span>}
          </label>
        )}
        <div className="relative">
          <input
            id={inputId}
            ref={ref}
            aria-invalid={!!error}
            aria-describedby={error ? errorId : helperText ? helperId : undefined}
            className={`w-full bg-slate-900 border rounded-lg px-3.5 py-2.5 text-sm text-slate-100 placeholder-slate-500 
              transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-slate-950
              disabled:opacity-50 disabled:cursor-not-allowed
              ${
                error
                  ? 'border-red-500/80 focus:border-red-500 focus:ring-red-500/30'
                  : 'border-slate-800 hover:border-slate-700 focus:border-blue-500 focus:ring-blue-500/30'
              } ${className}`}
            {...props}
          />
        </div>
        {error ? (
          <p id={errorId} className="text-xs text-red-400 font-medium">
            {error}
          </p>
        ) : helperText ? (
          <p id={helperId} className="text-xs text-slate-400">
            {helperText}
          </p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
