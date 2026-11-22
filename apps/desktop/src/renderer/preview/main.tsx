import { mount } from '../shared/mount';
import { DEMOS } from './demos';
import { FRAMES } from './frames';

const params = new URLSearchParams(location.search);
const demo = params.get('demo');
const frame = params.get('frame') ?? '1a';

document.documentElement.dataset.preview = 'true';
document.body.style.overflow = 'auto';
document.body.style.background = demo ? 'transparent' : '#f0eee6';

mount(<div style={{ display: 'inline-block' }}>{demo ? DEMOS[demo]?.() : FRAMES[frame]?.()}</div>);
