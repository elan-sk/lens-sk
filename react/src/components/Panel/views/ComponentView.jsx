import CopyableRow from '../../shared/CopyableRow';
import SectionHeader from '../../shared/SectionHeader';
import { nearestSemanticContainer, mainClassOf } from '../../../lib/dom';

export default function ComponentView({ el }) {
  const container = nearestSemanticContainer(el);
  const mainClass = container ? mainClassOf(container) : '';

  return (
    <div>
      <SectionHeader>Elemento</SectionHeader>
      <CopyableRow label="Tag" value={el.tagName.toLowerCase()} />
      <CopyableRow label="Clases" value={el.className || '(sin clases)'} />

      <SectionHeader>Componente</SectionHeader>
      <CopyableRow label="Contenedor" value={container ? container.tagName.toLowerCase() : '—'} />
      <CopyableRow label="Clase principal" value={mainClass || '—'} />
    </div>
  );
}
