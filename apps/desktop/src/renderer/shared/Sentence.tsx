/** A frase entre aspas, com a palavra sublinhada na cor de destaque. */
export function Sentence({
  sentence,
  surface,
  thick,
}: {
  sentence: string;
  surface: string;
  thick: boolean;
}) {
  const start = sentence.toLowerCase().indexOf(surface.toLowerCase());
  if (start < 0) return <>“{sentence}”</>;
  const end = start + surface.length;
  return (
    <>
      “{sentence.slice(0, start)}
      <span
        className={`underline decoration-accent underline-offset-[3px] ${thick ? 'decoration-[1.5px]' : ''}`}
      >
        {sentence.slice(start, end)}
      </span>
      {sentence.slice(end)}”
    </>
  );
}
