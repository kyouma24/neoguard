import React, { forwardRef } from 'react';
import { TabsProps } from './TabsProps';
import { StyleComposer } from '../../base';
import styles from './Tabs.module.scss';

const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  (
    { tabs, activeTab, onChange, variant = 'line', className = '', ...rest },
    ref
  ) => {
    const styleComposer = new StyleComposer({
      baseClass: styles.tabsContainer,
      modifiers: {
        line: styles.line,
        pill: styles.pill,
      },
    });

    const containerClasses = styleComposer.build(undefined, [variant], className);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (e.key === 'ArrowRight' && index < tabs.length - 1) {
        onChange(tabs[index + 1].id);
      } else if (e.key === 'ArrowLeft' && index > 0) {
        onChange(tabs[index - 1].id);
      }
    };

    const activeContent = tabs.find((t) => t.id === activeTab);

    return (
      <div ref={ref} className={containerClasses} {...rest}>
        <div className={styles.tabButtons} role="tablist">
          {tabs.map((tab, index) => (
            <button
              key={tab.id}
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.active : ''}`}
              onClick={() => !tab.disabled && onChange(tab.id)}
              disabled={tab.disabled}
              role="tab"
              aria-selected={activeTab === tab.id}
              onKeyDown={(e) => handleKeyDown(e, index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className={styles.tabContent} role="tabpanel">
          {activeContent?.content}
        </div>
      </div>
    );
  }
);

Tabs.displayName = 'Tabs';
export default Tabs;
