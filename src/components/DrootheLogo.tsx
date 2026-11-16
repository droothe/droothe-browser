type DrootheLogoProps = {
  size?: number;
  className?: string;
};

export default function DrootheLogo({ size = 40, className }: DrootheLogoProps) {
  return (
    <img
      src="/droothe-logo.png"
      alt=""
      aria-hidden="true"
      className={className}
      width={size}
      height={size}
      draggable={false}
    />
  );
}
