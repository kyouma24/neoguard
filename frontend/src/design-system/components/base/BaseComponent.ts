import { ReactNode } from 'react';
import { IComponent, ComponentProps } from './IComponent';
import { StyleComposer } from './StyleComposer';

export abstract class BaseComponent<T extends ComponentProps = ComponentProps> implements IComponent {
  protected props: T;
  protected styleComposer: StyleComposer;

  constructor(props: T) {
    this.props = props;
    this.styleComposer = new StyleComposer();
  }

  abstract render(): ReactNode;

  getDisplayName(): string {
    return this.constructor.name;
  }

  protected getBaseClassName(): string {
    return this.styleComposer.compose(this.props.className);
  }

  protected mergeClasses(...classes: (string | undefined)[]): string {
    return classes.filter(Boolean).join(' ');
  }
}
