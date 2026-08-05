import CopyableRow from '../../shared/CopyableRow';
import SectionHeader from '../../shared/SectionHeader';
import { getBoxModel, getTypography, getBackgroundAndEffects } from '../../../lib/dom';

// Versión de solo-lectura de la vista Estilos — sin overlay en vivo, sin
// diagrama box-model visual ni edición inline todavía (eso es un paso
// posterior, ver SKILL.md). Cubre lo esencial: tipografía, tamaño,
// padding/margin por lado, y fondo/efectos — mismos grupos que el original.
export default function StylesView({ el }) {
  const box = getBoxModel(el);
  const typo = getTypography(el);
  const bg = getBackgroundAndEffects(el);

  return (
    <div>
      <SectionHeader>Tipografía</SectionHeader>
      <CopyableRow label="Familia" value={typo.fontFamily} />
      <CopyableRow label="Tamaño" value={typo.fontSize} />
      <CopyableRow label="Peso" value={typo.fontWeight} />
      <CopyableRow label="Line-height" value={typo.lineHeight} />
      <CopyableRow label="Letter-spacing" value={typo.letterSpacing} />
      <CopyableRow label="Color" value={typo.color} />

      <SectionHeader>Tamaño</SectionHeader>
      <CopyableRow label="Width" value={box.size.width} />
      <CopyableRow label="Height" value={box.size.height} />

      <SectionHeader>Padding</SectionHeader>
      <CopyableRow label="Arriba" value={box.padding.top} />
      <CopyableRow label="Derecha" value={box.padding.right} />
      <CopyableRow label="Abajo" value={box.padding.bottom} />
      <CopyableRow label="Izquierda" value={box.padding.left} />

      <SectionHeader>Margin</SectionHeader>
      <CopyableRow label="Arriba" value={box.margin.top} />
      <CopyableRow label="Derecha" value={box.margin.right} />
      <CopyableRow label="Abajo" value={box.margin.bottom} />
      <CopyableRow label="Izquierda" value={box.margin.left} />

      <SectionHeader>Bordes</SectionHeader>
      <CopyableRow label="Ancho arriba" value={box.border.top} />
      <CopyableRow label="Ancho derecha" value={box.border.right} />
      <CopyableRow label="Ancho abajo" value={box.border.bottom} />
      <CopyableRow label="Ancho izquierda" value={box.border.left} />

      <SectionHeader>Fondo y efectos</SectionHeader>
      <CopyableRow label="Background" value={bg.backgroundColor} />
      <CopyableRow label="Box-shadow" value={bg.boxShadow} />
      <CopyableRow label="Opacity" value={bg.opacity} />
      <CopyableRow label="Overflow" value={bg.overflow} />
      <CopyableRow label="Cursor" value={bg.cursor} />
    </div>
  );
}
