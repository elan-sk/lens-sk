import { colors } from '../../styles/tokens';

export default function SectionHeader({ children }) {
  return (
    <h4
      style={{
        margin: '14px 0 4px',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '.06em',
        color: colors.muted,
        fontWeight: 600,
      }}
    >
      {children}
    </h4>
  );
}
