import DefaultTheme from 'vitepress/theme';
import '@fontsource-variable/inter';
import './custom.css';
import Layout from './Layout.vue';

export default {
	extends: DefaultTheme,
	Layout,
};
