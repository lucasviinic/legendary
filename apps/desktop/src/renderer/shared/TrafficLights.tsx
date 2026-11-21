const COLORS = ['#FF5F57', '#FEBC2E', '#28C840'];

export function TrafficLights() {
  return (
    <div className="traffic-lights flex gap-2">
      {COLORS.map((color) => (
        <span key={color} className="size-3 rounded-full" style={{ background: color }} />
      ))}
    </div>
  );
}
