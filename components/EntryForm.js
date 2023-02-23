'use client';
import Link from 'next/link';
import { useRef } from 'react';

import styles from './EntryForm.module.css';

export default function EntryForm({ entry }) {
	const formRef = useRef(null);
	const handleSubmit = (event) => {
		event.preventDefault();
		console.log('create entry');
	};

	return (
		<>
			<h2>Create New Entry</h2>
			<section>
				<form onSubmit={handleSubmit} ref={formRef}>
					<fieldset>
						<legend>Entry Details</legend>
						<input type="text" value={entry?.value} name="title" />
					</fieldset>
					<div className={styles.actions}>
						<button type="submit">
							Create
						</button>
						<Link href="/entries">
							Cancel
						</Link>
					</div>
				</form>
			</section>
		</>
	);
}