import { Fragment } from 'react';
import { PageHeader } from '../PageHeader';
import { FormLayout, FormSection, FormField, FormActions } from '../FormLayout';
import { Card } from '../../composite/Card';
import { Button } from '../../primitives/Button';
import type { FormScreenProps } from './FormScreenProps';
import styles from './FormScreen.module.scss';

/**
 * FormScreen — generic CRUD form page template. Composes PageHeader +
 * Card + FormLayout/FormSection/FormField + FormActions behind a single
 * config-driven props surface, so each entity needs only field defs.
 *
 * @example
 * <FormScreen
 *   title="New record"
 *   sections={[
 *     { title: 'Basic info', columns: 2, fields: [
 *       { label: 'Name', required: true, control: <Input … /> },
 *     ]},
 *   ]}
 *   actions={{ cancel: { label: 'Cancel' }, primary: { label: 'Create' } }}
 * />
 */
export function FormScreen({
  breadcrumbs,
  title,
  subtitle,
  headerActions,
  sections,
  actions,
  state = 'default',
  banner,
  savingMessage = 'Saving…',
  maxWidth = '72rem',
  className = '',
  testId,
}: FormScreenProps) {
  return (
    <div className={`${styles.root} ${className}`.trim()} style={{ maxWidth }} data-testid={testId}>
      <PageHeader
        breadcrumbs={breadcrumbs}
        title={title}
        subtitle={subtitle}
        actions={headerActions}
      />

      {banner && <div className={styles.banner}>{banner}</div>}

      {state === 'saving' ? (
        <Card>
          <div className={styles.savingPanel}>
            <div className={styles.spinner} aria-hidden="true" />
            {savingMessage}
          </div>
        </Card>
      ) : (
        <Card>
          {sections.map((section, idx) => (
            <Fragment key={idx}>
              {idx > 0 && <div className={styles.sectionGap} aria-hidden="true" />}
              <FormSection title={section.title} description={section.description}>
                <FormLayout columns={section.columns ?? 2}>
                  {section.fields.map((f, fi) => (
                    <FormField
                      key={fi}
                      label={f.label}
                      htmlFor={f.htmlFor}
                      required={f.required}
                      hint={f.hint}
                      error={f.error}
                      full={f.full}
                    >
                      {f.control}
                    </FormField>
                  ))}
                </FormLayout>
              </FormSection>
            </Fragment>
          ))}

          <FormActions align={actions.align ?? 'between'}>
            {actions.cancel && (
              <Button variant={actions.cancel.variant ?? 'ghost'} disabled={actions.cancel.disabled} onClick={actions.cancel.onClick}>
                {actions.cancel.label}
              </Button>
            )}
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {actions.extras}
              {actions.secondary?.map((a, i) => (
                <Button key={i} variant={a.variant ?? 'secondary'} disabled={a.disabled} onClick={a.onClick}>
                  {a.label}
                </Button>
              ))}
              <Button variant={actions.primary.variant ?? 'primary'} disabled={actions.primary.disabled} onClick={actions.primary.onClick}>
                {actions.primary.label}
              </Button>
            </div>
          </FormActions>
        </Card>
      )}
    </div>
  );
}

export default FormScreen;
