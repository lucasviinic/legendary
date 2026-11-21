import { mount } from '../shared/mount';
import { FRAMES } from './frames';

const frame = new URLSearchParams(location.search).get('frame') ?? '1a';

document.documentElement.dataset.preview = 'true';
document.body.style.overflow = 'auto';
document.body.style.background = '#f0eee6';

mount(<div style={{ display: 'inline-block' }}>{FRAMES[frame]?.()}</div>);
