export interface VariantMap {
  [key: string]: string;
}

export interface StyleComposerConfig {
  baseClass?: string;
  variants?: VariantMap;
  modifiers?: VariantMap;
}

export class StyleComposer {
  private baseClass: string;
  private variants: VariantMap;
  private modifiers: VariantMap;

  constructor(config: StyleComposerConfig = {}) {
    this.baseClass = config.baseClass || '';
    this.variants = config.variants || {};
    this.modifiers = config.modifiers || {};
  }

  compose(...classes: (string | undefined | false)[]): string {
    return classes.filter((cls): cls is string => Boolean(cls)).join(' ');
  }

  addVariant(name: string, className: string): this {
    this.variants[name] = className;
    return this;
  }

  addModifier(name: string, className: string): this {
    this.modifiers[name] = className;
    return this;
  }

  build(
    variant?: string | null,
    modifiers?: string[] | null,
    customClass?: string
  ): string {
    const classes: string[] = [];

    if (this.baseClass) {
      classes.push(this.baseClass);
    }

    if (variant && this.variants[variant]) {
      classes.push(this.variants[variant]);
    }

    if (modifiers && modifiers.length > 0) {
      modifiers.forEach(mod => {
        if (this.modifiers[mod]) {
          classes.push(this.modifiers[mod]);
        }
      });
    }

    if (customClass) {
      classes.push(customClass);
    }

    return this.compose(...classes);
  }
}
