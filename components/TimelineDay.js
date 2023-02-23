import styles from './TimelineDay.module.css';

export default function TimelineEntry({ children, day }) {
	return (
		<div className={styles.timelineDay} dataDay={day}>
			{ children }
		</div>
	);
}