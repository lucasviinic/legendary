import { mount } from '../shared/mount';
import { FRAMES } from './frames';

/** Página de comparação com o mockup: `?frame=1a`. Fica fora do build de produção. */
const frame = new URLSearchParams(location.search).get('frame') ?? '1a';

document.documentElement.dataset.preview = 'true';
document.body.style.overflow = 'auto';
document.body.style.background = '#f0eee6';

mount(<div style={{ display: 'inline-block' }}>{FRAMES[frame]?.()}</div>);
