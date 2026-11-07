const COLORS = ['#FF5F57', '#FEBC2E', '#28C840'];

/**
 * Reserva o espaço do semáforo nativo do macOS, que o sistema desenha por cima. Os pontos só ficam
 * visíveis na página de comparação com o mockup, que não roda dentro de uma janela de verdade.
 */
export function TrafficLights() {
  return (
    <div className="traffic-lights flex gap-2">
      {COLORS.map((color) => (
        <span key={color} className="size-3 rounded-full" style={{ background: color }} />
      ))}
    </div>
  );
}
