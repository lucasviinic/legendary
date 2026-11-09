import { TrafficLights } from '../shared/TrafficLights';

/** Quiz sem palavras, quando a pessoa já sabia todas as da sessão: frame 2b. Enter também fecha. */
export function NoWordsView({ onClose }: { onClose?: () => void }) {
  return (
    <div className="flex h-full flex-col bg-surface text-[13px] text-white">
      <div className="drag flex h-[38px] flex-none items-center px-3.5">
        <TrafficLights />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-[18px]">
        <span className="text-[17px] font-semibold">Nenhuma palavra para o quiz</span>
        <button
          onClick={onClose}
          className="flex h-[34px] items-center gap-2 rounded-[9px] bg-white px-[18px] font-semibold text-ink"
        >
          Fechar <span className="text-[11px] opacity-55">↵</span>
        </button>
      </div>
    </div>
  );
}
