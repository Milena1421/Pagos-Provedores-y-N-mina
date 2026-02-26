
export enum PaymentStatus {
  Radicado = 'Radicado',
  Pagado = 'Pagado',
  Devuelto = 'Devuelto'
}

export enum Category {
  Honorarios = 'Honorarios',
  Impuesto = 'Impuesto',
  Polizas = 'Pólizas',
  SeguridadSocial = 'Seguridad Social',
  Nomina = 'Nómina',
  ServiciosPublicos = 'Servicios Públicos'
}

export enum DocumentType {
  CC = 'Cédula de Ciudadanía',
  NIT = 'NIT',
  CE = 'Cédula de Extranjería',
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
  data: string; // URL o Base64
  type: string; // mimeType
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
  proveedor: string;
  identificacion: string;
  categoria: Category;
  descripcion: string;
  valor: number;
  observacion: string;
  estado: PaymentStatus;
  supports: SupportFile[];
  comprobantePago?: string; 
  comprobanteFile?: SupportFile; // Archivo de soporte del pago realizado
  motivoDevolucion?: string;    
  createdAt: number;
}

export type ViewType = 'dashboard' | 'form' | 'table' | 'directory';
