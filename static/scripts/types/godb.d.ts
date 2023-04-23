declare type TableIndexTypes = NumberConstructor | StringConstructor | BooleanConstructor | DateConstructor | ObjectConstructor | ArrayConstructor;
interface TableIndex {
  type: TableIndexTypes;
  multiEntry?: boolean;
  unique?: boolean;
  default?: any;
  ref?: string;
}
interface GoDBTableSchema {
  [key: string]: TableIndex | TableIndexTypes;
}
export interface GoDBSchema {
  [table: string]: GoDBTableSchema;
}
