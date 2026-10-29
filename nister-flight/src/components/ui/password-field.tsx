"use client";

import { useId, useState } from "react";

type PasswordFieldProps = {
  name: string;
  label: string;
  autoComplete?: string;
  minLength?: number;
  required?: boolean;
  placeholder?: string;
};

export function PasswordField({ name, label, autoComplete, minLength, required, placeholder }: PasswordFieldProps) {
  const [visible, setVisible] = useState(false);
  const id = useId();

  return (
    <label>
      {label}
      <div className="password-wrap">
        <input
          id={id}
          aria-label={label}
          name={name}
          type={visible ? "text" : "password"}
          minLength={minLength}
          required={required}
          autoComplete={autoComplete}
          placeholder={placeholder}
        />
        <button className="password-toggle" type="button" onClick={() => setVisible((value) => !value)}>
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </label>
  );
}
