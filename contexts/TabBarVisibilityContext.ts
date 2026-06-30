import { createContext, useContext } from 'react';

export const TAB_BAR_HEIGHT = 60;

type TabBarCtx = { setTabBarVisible: (v: boolean) => void };
export const TabBarVisibilityContext = createContext<TabBarCtx>({ setTabBarVisible: () => {} });
export const useTabBarVisibility = () => useContext(TabBarVisibilityContext);
