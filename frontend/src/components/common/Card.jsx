import styles from './Card.module.css';

export default function Card({ title, icon, children, className = '', style = {} }) {
  return (
    <div className={`${styles.card} ${className}`} style={style}>
      {title && (
        <div className={styles.cardTitle}>
          {icon}
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function StatCard({ title, value, label, color = 'var(--accent-blue)', icon }) {
  return (
    <Card title={title} icon={icon}>
      <div className={styles.cardValue} style={{ color }}>{value}</div>
      <div className={styles.cardLabel}>{label}</div>
    </Card>
  );
}
