import { createRouter, createWebHistory } from "vue-router";

export const router = createRouter({
	history: createWebHistory(),
	routes: [
		{
			path: "/",
			name: "browse",
			component: () => import("./pages/BrowsePage.vue"),
		},
		{
			path: "/program/:slug",
			name: "program",
			component: () => import("./pages/ProgramPage.vue"),
			props: true,
		},
		{ path: "/:pathMatch(.*)*", redirect: "/" },
	],
	scrollBehavior(to, _from, saved) {
		if (saved) return saved;
		if (to.hash) return { el: to.hash };
		return { top: 0 };
	},
});
