export enum PaymentStatus {
  Radicado = 'Radicado',
  Pagado = 'Pagado',
  Devuelto = 'Devuelto'
}

export enum Category {
  Honorarios = 'Honorarios',
  Impuesto = 'Impuesto',
  Reembolso = 'Reembolso',
  Polizas = 'Polizas',
  SeguridadSocial = 'Seguridad Social',
  Nomina = 'Nomina',
  ServiciosPublicos = 'Servicios Publicos',
  OtrosGastos = 'Otros Gastos'
}

export enum DocumentType {
  CC = 'Cedula de Ciudadania',
  NIT = 'NIT',
  CE = 'Cedula de Extranjeria',
  TI = 'Tarjeta de Identidad',
  PA = 'Pasaporte',
  PEP = 'Permiso Especial de Permanencia'
}

export enum BankAccountType {
  Ahorros = 'Ahorros',
  Corriente = 'Corriente'
}

export interface SupportFile {
  id: string;
  name: string;
  data: string;
  type: string;
}

export interface Provider {
  identificacion: string;
  nombre: string;
  tipoDocumento: DocumentType;
  correo: string;
  direccion: string;
  telefono: string;
  entidadBancaria: string;
  numeroCuenta: string;
  tipoCuenta: BankAccountType;
}

export interface PaymentRecord {
  id: string;
  radicado: string;
  mesContable: string;
  fechaDocumento: string;
  fechaPago: string;
  fechaPagoReal?: string;
  numeroDocumento?: string;
  proveedor: string;
  identificacion: string;
  categoria: Category;
  descripcion: string;
  subtotal?: number;
  iva?: number;
  retefuente?: number;
  valor: number;
  observacion: string;
  estado: PaymentStatus;
  supports: SupportFile[];
  comprobantePago?: string;
  comprobanteFile?: SupportFile;
  motivoDevolucion?: string;
  createdAt: number;
}

export type ViewType = 'dashboard' | 'form' | 'table' | 'directory';

export type UserRole = 'Administrador' | 'Pagos' | 'Contabilidad';

export interface UserPermissions {
  views: ViewType[];
  canManageNotifications: boolean;
  canManagePaymentStatus: boolean;
}

export interface AppUser {
  id: string;
  username: string;
  password: string;
  displayName: string;
  role: UserRole;
  permissions: UserPermissions;
}
