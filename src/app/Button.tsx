import { ReactNode, MouseEventHandler } from "react";
import classNames from "classnames";

type Props = {
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  disabled?: boolean;
  big?: boolean;
  className?: string;
};

export default function Button({ onClick, children, disabled, big, className }: Props) {
  return (
    <button
      className={classNames(
        "appearance-none",
        big ? "p-2" : "px-1",
        "rounded-md",
        "border-0",
        "text-white",
        disabled ? "bg-slate-500" : "bg-sky-500",
        disabled ? "cursor-not-allowed" : "cursor-pointer",
        className,
      )}
      onClick={onClick}
      disabled={!!disabled}
    >
      {children}
    </button>
  );
}