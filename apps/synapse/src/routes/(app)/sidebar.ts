import {
	Book,
	BookOpen,
	Dumbbell,
	Heart,
	House,
	Shield,
	SquareCheck,
	Users
} from '@lucide/svelte/icons';

import type { SidebarNav } from '#lib/types.js';

export const navItems: SidebarNav = {
	navMain: [
		{
			title: 'Dashboard',
			description: 'Overview of your activities and stats',
			url: '/dashboard',
			icon: House,
			pen: 'teal',
			short: 'Today'
		},
		{
			title: 'Tasks',
			description: 'Track work on a kanban board with priorities and states',
			url: '/tasks',
			icon: SquareCheck,
			pen: 'orange',
			short: 'Tasks'
		},
		{
			title: 'Fitness',
			description: 'Track workouts, food log, and weigh-ins',
			url: '/fitness',
			icon: Dumbbell,
			pen: 'green',
			short: 'Fitness'
		},
		{
			title: 'Family Worship',
			description: 'Plan, rotate and log the weekly Wednesday study',
			url: '/family-worship',
			icon: BookOpen,
			pen: 'brown',
			short: 'Worship'
		},
		{
			title: 'Visits',
			description: 'Keep track of meaningful connections',
			url: '/visits',
			icon: Users,
			pen: 'pink',
			short: 'Visits'
		},
		{
			title: 'Journal',
			description: 'Capture your daily thoughts and experiences',
			url: '/journal',
			icon: Book,
			pen: 'blue',
			short: 'Journal',
			mobileOverflow: true
		},
		{
			title: 'Meditation',
			description: 'Build mindfulness habits with guided routines',
			url: '/meditation',
			icon: Heart,
			pen: 'purple',
			short: 'Meditation',
			mobileOverflow: true
		},
		{
			title: 'Admin',
			description: 'Manage users and archived group members',
			url: '/admin',
			icon: Shield,
			pen: 'teal',
			short: 'Admin',
			adminOnly: true
		}
	]
};
