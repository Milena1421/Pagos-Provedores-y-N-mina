import React, { useEffect, useState } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { supabase } from '../App';
import {
  BankAccountType,
  Category,
  DocumentType,
  PaymentRecord,
  PaymentStatus,
  Provider,
  SupportFile
} from '../types';

interface PaymentFormProps {
  onSubmit: (data: { record: PaymentRecord; provider: Provider }) => void;
  onCancel: () => void;
  initialData?: PaymentRecord | null;
  nextRadicado: string;
  providers: Provider[];
}

export const PaymentForm: React.FC<PaymentFormProps> = ({
  onSubmit,
  onCancel,
  initialData,
  nextRadicado,
  providers
}) => {
  const COMPANY_IDENTIFICATION = '901290421';
  const COMPANY_NAME_HINTS = ['INGENIERIA 365', 'INGENIERIA365'];
  const TAX_STATUTE_URL = 'https://estatuto.co/';
  const UVT_BY_YEAR: Record<number, number> = {
    2026: 52374
  };

  type RetentionSuggestion = {
    concept: string;
    rateLabel: string;
    rate?: number;
    minimumUvt?: number;
    fixedMinimumLabel?: string;
    note?: string;
    keywords: string[];
    categories?: Category[];
    requiresNaturalPerson?: boolean;
    requiresCompany?: boolean;
  };

  const RETENTION_SUGGESTIONS_2026: RetentionSuggestion[] = [
    {
      concept: 'Honorarios y comisiones para personas juridicas',
      rateLabel: '11%',
      rate: 0.11,
      fixedMinimumLabel: '100% del pago o abono en cuenta',
      keywords: ['honorario', 'comision', 'consultoria', 'asesoria', 'profesional'],
      categories: [Category.Honorarios],
      requiresCompany: true
    },
    {
      concept: 'Honorarios y comisiones para personas naturales no declarantes',
      rateLabel: '10%',
      rate: 0.10,
      fixedMinimumLabel: '100% del pago o abono en cuenta',
      keywords: ['honorario', 'comision', 'consultoria', 'asesoria', 'profesional'],
      categories: [Category.Honorarios],
      requiresNaturalPerson: true,
      note: 'Si la persona natural supera 3.300 UVT por contrato o pagos acumulados, la tabla anexa indica tarifa del 11%.'
    },
    {
      concept: 'Servicios generales declarantes de renta',
      rateLabel: '4%',
      rate: 0.04,
      minimumUvt: 2,
      keywords: ['servicio', 'mantenimiento', 'reparacion', 'instalacion', 'logistica', 'soporte'],
      categories: [Category.Honorarios]
    },
    {
      concept: 'Servicios generales no declarantes de renta',
      rateLabel: '6%',
      rate: 0.06,
      minimumUvt: 2,
      keywords: ['servicio', 'mantenimiento', 'reparacion', 'instalacion', 'logistica', 'soporte'],
      categories: [Category.Honorarios],
      requiresNaturalPerson: true
    },
    {
      concept: 'Compras generales declarantes de renta',
      rateLabel: '2,5%',
      rate: 0.025,
      minimumUvt: 10,
      keywords: ['compra', 'suministro', 'material', 'insumo', 'producto', 'equipo']
    },
    {
      concept: 'Compras generales no declarantes de renta',
      rateLabel: '3,5%',
      rate: 0.035,
      minimumUvt: 10,
      keywords: ['compra', 'suministro', 'material', 'insumo', 'producto', 'equipo'],
      requiresNaturalPerson: true
    },
    {
      concept: 'Arrendamiento de bienes inmuebles',
      rateLabel: '3,5%',
      rate: 0.035,
      minimumUvt: 10,
      keywords: ['arrendamiento', 'arriendo', 'inmueble', 'oficina', 'bodega', 'local']
    },
    {
      concept: 'Servicios de hoteles y restaurantes',
      rateLabel: '3,5%',
      rate: 0.035,
      minimumUvt: 2,
      keywords: ['hotel', 'restaurante', 'alojamiento', 'hospedaje', 'alimentacion']
    },
    {
      concept: 'Servicios de transporte nacional de carga',
      rateLabel: '1%',
      rate: 0.01,
      minimumUvt: 2,
      keywords: ['transporte', 'carga', 'flete', 'mensajeria']
    },
    {
      concept: 'Servicios publicos domiciliarios',
      rateLabel: 'No sugerir retefuente automaticamente',
      fixedMinimumLabel: 'Validar naturaleza del pago y calidad del proveedor',
      keywords: ['servicio publico', 'energia', 'agua', 'gas', 'internet', 'telefono', 'celular'],
      categories: [Category.ServiciosPublicos],
      note: 'La tabla anexa no trae una tarifa unica de retefuente para servicios publicos; valida el soporte antes de registrar retencion.'
    },
    {
      concept: 'Rentas de trabajo',
      rateLabel: 'Tabla art. 383 ET',
      minimumUvt: 95,
      keywords: ['nomina', 'salario', 'honorarios laborales', 'renta de trabajo', 'art 383', 'articulo 383', 'artículo 383'],
      categories: [Category.Nomina],
      note: 'Aplicar tabla progresiva del articulo 383 del Estatuto Tributario, no una tarifa fija.'
    },
    {
      concept: 'Rete IVA por servicios',
      rateLabel: '15% sobre el IVA',
      rate: 0.15,
      minimumUvt: 2,
      keywords: ['rete iva servicio', 'iva servicio']
    },
    {
      concept: 'Rete IVA por compras',
      rateLabel: '15% sobre el IVA',
      rate: 0.15,
      minimumUvt: 10,
      keywords: ['rete iva compra', 'iva compra']
    }
  ];

  const toIsoDate = (date: Date) => date.toISOString().split('T')[0];

  const addDays = (date: Date, days: number) => {
    const nextDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    nextDate.setUTCDate(nextDate.getUTCDate() + days);
    return nextDate;
  };

  const getNextMonday = (date: Date) => {
    const day = date.getUTCDay();
    if (day === 1) return date;
    return addDays(date, (8 - day) % 7);
  };

  const getEasterDate = (year: number) => {
    const a = year % 19;
    const b = Math.floor(year / 100);
    const c = year % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const month = Math.floor((h + l - 7 * m + 114) / 31);
    const day = ((h + l - 7 * m + 114) % 31) + 1;
    return new Date(Date.UTC(year, month - 1, day));
  };

  const getColombiaHolidaySet = (year: number) => {
    const holidays = new Set<string>();
    const addHoliday = (month: number, day: number) => holidays.add(toIsoDate(new Date(Date.UTC(year, month - 1, day))));
    const addMovedHoliday = (month: number, day: number) => holidays.add(toIsoDate(getNextMonday(new Date(Date.UTC(year, month - 1, day)))));

    addHoliday(1, 1);
    addMovedHoliday(1, 6);
    addMovedHoliday(3, 19);
    addHoliday(5, 1);
    addMovedHoliday(6, 29);
    addHoliday(7, 20);
    addHoliday(8, 7);
    addMovedHoliday(8, 15);
    addMovedHoliday(10, 12);
    addMovedHoliday(11, 1);
    addMovedHoliday(11, 11);
    addHoliday(12, 8);
    addHoliday(12, 25);

    const easter = getEasterDate(year);
    holidays.add(toIsoDate(addDays(easter, -3)));
    holidays.add(toIsoDate(addDays(easter, -2)));
    holidays.add(toIsoDate(getNextMonday(addDays(easter, 39))));
    holidays.add(toIsoDate(getNextMonday(addDays(easter, 60))));
    holidays.add(toIsoDate(getNextMonday(addDays(easter, 68))));

    return holidays;
  };

  const isBusinessDay = (date: Date) => {
    const day = date.getUTCDay();
    if (day === 0 || day === 6) return false;
    return !getColombiaHolidaySet(date.getUTCFullYear()).has(toIsoDate(date));
  };

  const getLastBusinessDayOfMonthIso = (dateIso?: string) => {
    const source = dateIso && /^\d{4}-\d{2}-\d{2}$/.test(dateIso) ? dateIso : toIsoDate(new Date());
    const [year, month] = source.split('-').map(Number);
    let candidate = new Date(Date.UTC(year, month, 0));

    while (!isBusinessDay(candidate)) {
      candidate = addDays(candidate, -1);
    }

    return toIsoDate(candidate);
  };

  const [formData, setFormData] = useState<Partial<PaymentRecord>>({
    mesContable: new Date().toLocaleString('es-ES', { month: 'long', year: 'numeric' }),
    fechaDocumento: new Date().toISOString().split('T')[0],
    fechaPago: getLastBusinessDayOfMonthIso(new Date().toISOString().split('T')[0]),
    numeroDocumento: '',
    proveedor: '',
    identificacion: '',
    categoria: Category.Honorarios,
    descripcion: '',
    subtotal: 0,
    iva: 0,
    retefuente: 0,
    valor: 0,
    observacion: '',
    estado: PaymentStatus.Radicado,
    supports: [],
    motivoDevolucion: '',
    comprobantePago: '',
  });

  const [providerData, setProviderData] = useState<Partial<Provider>>({
    tipoDocumento: DocumentType.CC,
    correo: '',
    direccion: '',
    telefono: '',
    entidadBancaria: '',
    numeroCuenta: '',
    tipoCuenta: BankAccountType.Ahorros
  });

  const [supports, setSupports] = useState<SupportFile[]>([]);
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isPaymentDateTouched, setIsPaymentDateTouched] = useState(false);

  const sanitizeTextField = (value: unknown) => {
    if (typeof value !== 'string') return '';
    const normalized = value.trim();
    return normalized.toLowerCase() === 'null' ? '' : normalized;
  };

  const normalizeComparableText = (value: unknown) => {
    if (typeof value !== 'string') return '';
    return value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toUpperCase()
      .replace(/[^\w\s@.-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const formatCOP = (value: number) =>
    new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      maximumFractionDigits: 0
    }).format(Math.round(value || 0));

  const normalizeAmount = (value: unknown) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const calculatePayableAmount = (subtotal?: number, iva?: number, retefuente?: number) => {
    return Math.max(Number(subtotal || 0) + Number(iva || 0) - Number(retefuente || 0), 0);
  };

  const hasTaxBreakdown = (subtotal?: number, iva?: number, retefuente?: number) => {
    return Number(subtotal || 0) > 0 || Number(iva || 0) > 0 || Number(retefuente || 0) > 0;
  };

  const getTaxYear = () => {
    const documentYear = Number(String(formData.fechaDocumento || '').slice(0, 4));
    return Number.isFinite(documentYear) && documentYear > 2000 ? documentYear : new Date().getFullYear();
  };

  const taxYear = getTaxYear();
  const configuredUvtYears = Object.keys(UVT_BY_YEAR).map(Number).sort((a, b) => b - a);
  const latestConfiguredUvtYear = configuredUvtYears[0];
  const activeUvtYear = UVT_BY_YEAR[taxYear] ? taxYear : latestConfiguredUvtYear;
  const activeUvtValue = UVT_BY_YEAR[activeUvtYear];
  const isUvtOutdated = activeUvtYear !== taxYear;

  const getMinimumAmount = (suggestion: RetentionSuggestion) => (suggestion.minimumUvt || 0) * activeUvtValue;

  const getMinimumLabel = (suggestion: RetentionSuggestion) => {
    if (suggestion.fixedMinimumLabel) return suggestion.fixedMinimumLabel;
    if (!suggestion.minimumUvt) return '100% del pago o abono en cuenta';
    return `${suggestion.minimumUvt} UVT (${formatCOP(getMinimumAmount(suggestion))})`;
  };

  const retentionBase = Number(formData.subtotal || 0) > 0 ? Number(formData.subtotal || 0) : Number(formData.valor || 0);

  const retentionSuggestion = (() => {
    const combined = normalizeComparableText(`${formData.categoria || ''} ${formData.descripcion || ''} ${formData.proveedor || ''}`);
    const isCompany = providerData.tipoDocumento === DocumentType.NIT;
    const isNaturalPerson = !isCompany;
    const mentionsArticle383 = /\bART(?:ICULO)?\s*383\b/.test(combined);

    const ranked = RETENTION_SUGGESTIONS_2026.map((suggestion) => {
      let score = 0;
      if (suggestion.categories?.includes(formData.categoria as Category)) score += 4;
      if (suggestion.keywords.some((keyword) => combined.includes(normalizeComparableText(keyword)))) score += 3;
      if (mentionsArticle383 && suggestion.concept === 'Rentas de trabajo') score += 10;
      if (suggestion.requiresCompany && isCompany) score += 2;
      if (suggestion.requiresNaturalPerson && isNaturalPerson) score += 2;
      if (suggestion.requiresCompany && !isCompany) score -= 3;
      if (suggestion.requiresNaturalPerson && !isNaturalPerson) score -= 2;
      return { suggestion, score };
    })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score);

    return ranked[0]?.suggestion;
  })();

  const retentionMinimumAmount = retentionSuggestion ? getMinimumAmount(retentionSuggestion) : 0;
  const suggestedRetentionValue =
    retentionSuggestion?.rate && retentionBase >= retentionMinimumAmount
      ? retentionBase * retentionSuggestion.rate
      : 0;

  const applySuggestedRetention = () => {
    const suggestedValue = Math.round(suggestedRetentionValue);

    setFormData((prev) => ({
      ...prev,
      retefuente: suggestedValue,
      valor: calculatePayableAmount(prev.subtotal, prev.iva, suggestedValue)
    }));
  };

  const getEmailDomain = (value?: string) => {
    const mail = sanitizeTextField(value);
    const atIndex = mail.indexOf('@');
    return atIndex >= 0 ? mail.slice(atIndex + 1).toLowerCase() : '';
  };

  const preferDirectoryValue = (directoryValue: unknown, currentValue: unknown) => {
    const sanitizedDirectoryValue = sanitizeTextField(directoryValue);
    if (sanitizedDirectoryValue) return sanitizedDirectoryValue;
    return sanitizeTextField(currentValue);
  };

  const inferDocumentType = (rawDocumentType?: string, identification?: string, providerName?: string, mail?: string): DocumentType => {
    const combined = normalizeComparableText([rawDocumentType, providerName, mail].filter(Boolean).join(' '));
    const cleanIdentification = sanitizeTextField(identification);
    const numericIdentification = cleanIdentification.replace(/\D/g, '');

    if (
      combined.includes('NIT') ||
      combined.includes('SAS') ||
      combined.includes('S A') ||
      combined.includes('SA ') ||
      combined.includes('LTDA') ||
      combined.includes('E U') ||
      combined.includes('EMPRESA') ||
      cleanIdentification.includes('-') ||
      numericIdentification.length >= 9
    ) {
      return DocumentType.NIT;
    }

    if (combined.includes('PASAPORTE')) return DocumentType.PA;
    if (combined.includes('TARJETA DE IDENTIDAD')) return DocumentType.TI;
    if (combined.includes('CEDULA DE EXTRANJERIA')) return DocumentType.CE;
    if (combined.includes('PERMISO ESPECIAL DE PERMANENCIA')) return DocumentType.PEP;

    return DocumentType.CC;
  };

  const inferCategory = (rawCategory?: string, providerName?: string, description?: string, mail?: string): Category => {
    const combined = normalizeComparableText([rawCategory, providerName, description, mail].filter(Boolean).join(' '));

    if (
      combined.includes('SERVICIO PUBLIC') ||
      combined.includes('CLARO') ||
      combined.includes('COMCEL') ||
      combined.includes('TELEFON') ||
      combined.includes('TELECOM') ||
      combined.includes('INTERNET') ||
      combined.includes('MOVIL') ||
      combined.includes('CELULAR') ||
      combined.includes('ENERGIA') ||
      combined.includes('ACUEDUCTO') ||
      combined.includes('ALCANTARILLADO') ||
      combined.includes('GAS')
    ) {
      return Category.ServiciosPublicos;
    }

    if (combined.includes('NOMINA')) return Category.Nomina;
    if (combined.includes('SEGURIDAD SOCIAL') || combined.includes('PARAFISCALES') || combined.includes('PENSION')) return Category.SeguridadSocial;
    if (combined.includes('IMPUESTO') || combined.includes('RETENCION') || combined.includes('IVA')) return Category.Impuesto;
    if (combined.includes('REEMBOLSO')) return Category.Reembolso;
    if (combined.includes('POLIZA') || combined.includes('SEGURO')) return Category.Polizas;

    return Category.Honorarios;
  };

  const shouldUseDirectoryProvider = (matchingProvider: Provider, currentProviderName?: string, currentMail?: string) => {
    const normalizedCurrent = normalizeComparableText(currentProviderName);
    const normalizedDirectory = normalizeComparableText(matchingProvider.nombre);
    const currentDomain = getEmailDomain(currentMail);
    const directoryDomain = getEmailDomain(matchingProvider.correo);

    if (!normalizedCurrent) return true;
    if (normalizedCurrent === normalizedDirectory) return true;
    if (normalizedCurrent.includes(normalizedDirectory) || normalizedDirectory.includes(normalizedCurrent)) return true;
    if (currentDomain && directoryDomain && currentDomain === directoryDomain) return true;

    return false;
  };

  const syncProviderFromDirectory = (matchingProvider: Provider, forceProviderName = false) => {
    setFormData((prev) => ({
      ...prev,
      proveedor:
        forceProviderName || !sanitizeTextField(prev.proveedor) || shouldUseDirectoryProvider(matchingProvider, prev.proveedor, providerData.correo)
          ? matchingProvider.nombre
          : prev.proveedor
    }));

    setProviderData((prev) => ({
      ...prev,
      tipoDocumento: matchingProvider.tipoDocumento || prev.tipoDocumento,
      correo: preferDirectoryValue(matchingProvider.correo, prev.correo),
      direccion: preferDirectoryValue(matchingProvider.direccion, prev.direccion),
      telefono: preferDirectoryValue(matchingProvider.telefono, prev.telefono),
      entidadBancaria: preferDirectoryValue(matchingProvider.entidadBancaria, prev.entidadBancaria),
      numeroCuenta: preferDirectoryValue(matchingProvider.numeroCuenta, prev.numeroCuenta),
      tipoCuenta: matchingProvider.tipoCuenta || prev.tipoCuenta
    }));

    setIsAutoFilled(true);
  };

  const cleanId = (id: string) => {
    return id.toString().trim().replace(/\./g, '').replace(/[^0-9\-]/g, '');
  };

  const findProviderByIdentification = (identification?: string) => {
    const cleanedSearchId = cleanId(identification || '');
    if (!cleanedSearchId) return undefined;
    return providers.find((provider) => cleanId(provider.identificacion) === cleanedSearchId);
  };

  const extractFileIdentificationCandidates = (fileName: string) => {
    const matches = fileName.match(/\d{6,}/g) || [];
    const uniqueMatches = Array.from(new Set(matches.map((match) => cleanId(match)).filter(Boolean)));
    return uniqueMatches.sort((a, b) => b.length - a.length);
  };

  const isOwnCompanyDetection = (providerName?: string, identification?: string) => {
    const normalizedProviderName = normalizeComparableText(providerName);
    const cleanedIdentification = cleanId(identification || '').replace(/\D/g, '');
    const normalizedCompanyId = COMPANY_IDENTIFICATION.replace(/\D/g, '');

    return (
      COMPANY_NAME_HINTS.some((hint) => normalizedProviderName.includes(hint)) ||
      cleanedIdentification === normalizedCompanyId
    );
  };

  const normalizeAiDate = (value?: string) => {
    if (!value) return '';

    const rawValue = value.trim();
    if (!rawValue) return '';

    if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
      return rawValue;
    }

    const monthMap: Record<string, string> = {
      enero: '01',
      febrero: '02',
      marzo: '03',
      abril: '04',
      mayo: '05',
      junio: '06',
      julio: '07',
      agosto: '08',
      septiembre: '09',
      setiembre: '09',
      octubre: '10',
      noviembre: '11',
      diciembre: '12'
    };

    const normalizedText = rawValue
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/,/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const isoLike = normalizedText.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
    if (isoLike) {
      const [, year, month, day] = isoLike;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const dayFirst = normalizedText.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
    if (dayFirst) {
      const [, day, month, yearValue] = dayFirst;
      const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
      return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
    }

    const longDate = normalizedText.match(/(\d{1,2})\s+de?\s*([a-z]+)\s+de?\s*(\d{2,4})/);
    if (longDate) {
      const [, day, monthName, yearValue] = longDate;
      const month = monthMap[monthName];
      if (month) {
        const year = yearValue.length === 2 ? `20${yearValue}` : yearValue;
        return `${year}-${month}-${day.padStart(2, '0')}`;
      }
    }

    return '';
  };

  useEffect(() => {
    if (initialData) {
      setFormData(initialData);
      setIsPaymentDateTouched(Boolean(initialData.fechaPago));
      setSupports(initialData.supports || []);
      const matched = providers.find((provider) => cleanId(provider.identificacion) === cleanId(initialData.identificacion));
      if (matched) {
        syncProviderFromDirectory(matched, true);
      }
    }
  }, [initialData, providers]);

  useEffect(() => {
    if (!formData.identificacion || initialData || isAiLoading) return;

    const matchingProvider = findProviderByIdentification(formData.identificacion);

    if (matchingProvider) {
      syncProviderFromDirectory(matchingProvider);
    } else if (isAutoFilled) {
      setIsAutoFilled(false);
    }
  }, [formData.identificacion, formData.proveedor, providerData.correo, providers, initialData, isAiLoading, isAutoFilled]);

  useEffect(() => {
    if (!hasTaxBreakdown(formData.subtotal, formData.iva, formData.retefuente)) return;

    const payableAmount = calculatePayableAmount(formData.subtotal, formData.iva, formData.retefuente);
    if (Number(formData.valor || 0) === payableAmount) return;

    setFormData((prev) => ({
      ...prev,
      valor: payableAmount
    }));
  }, [formData.subtotal, formData.iva, formData.retefuente]);

  const uploadFileToSupabase = async (file: File): Promise<SupportFile> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${crypto.randomUUID()}.${fileExt}`;

    const { error: uploadError } = await supabase.storage.from('payments').upload(fileName, file, {
      cacheControl: '3600',
      contentType: file.type,
      upsert: false
    });
    if (uploadError) {
      console.error('Upload Error:', uploadError);
      throw new Error(`Error subiendo archivo: ${uploadError.message}`);
    }

    const { data } = supabase.storage.from('payments').getPublicUrl(fileName);
    return {
      id: crypto.randomUUID(),
      name: file.name,
      type: file.type,
      data: data.publicUrl
    };
  };

  const readFileAsBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    if (name === 'fechaPago') setIsPaymentDateTouched(true);

    setFormData((prev) => ({
      ...prev,
      [name]: ['valor', 'subtotal', 'iva', 'retefuente'].includes(name)
        ? parseFloat(value) || 0
        : name === 'identificacion'
          ? cleanId(value)
          : value,
      ...(name === 'fechaDocumento' && !isPaymentDateTouched ? { fechaPago: getLastBusinessDayOfMonthIso(value) } : {})
    }));
    if (name === 'proveedor') setIsAutoFilled(false);
  };

  const handleProviderInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setProviderData((prev) => ({ ...prev, [name]: sanitizeTextField(value) }));
  };

  const handleAiScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsAiLoading(true);
    try {
      const base64Data = await readFileAsBase64(file);
      const pureBase64 = base64Data.split(',')[1];

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: {
          parts: [
            { inlineData: { mimeType: file.type, data: pureBase64 } },
            {
              text: `Extrae informacion para tesoreria. REGLAS CRITICAS:
              1. 'direccion' DEBE contener nomenclaturas (Calle, Carrera, Av, No, #).
              2. 'telefono' DEBE contener UNICAMENTE digitos (7 a 10).
              3. NO intercambies estos campos bajo ninguna circunstancia.
              4. Identifica NIT/Cedula, tipo de documento, Razon Social del EMISOR o PROVEEDOR real de la factura, numero de factura/cuenta de cobro/comprobante/desprendible, Subtotal, IVA, Retencion en la fuente, Valor Total, Banco/Cuenta, fecha del documento y fecha de vencimiento si existe.
              5. 'date' debe ser la fecha de emision, expedicion o fecha de factura/documento. NO uses fecha de vencimiento ni fecha de pago para 'date'.
              6. Si la factura incluye impuestos o retenciones, devuelve 'subtotal', 'iva' y 'retefuente' por separado.
              7. Devuelve 'date' y 'due_date' en formato YYYY-MM-DD. Si no existe vencimiento explicito, deja 'due_date' vacio.
              8. NO uses como proveedor al cliente, comprador, adquiriente, pagador ni empresa receptora del servicio.
              9. Si la factura es de Claro, energia, agua, gas, internet o telefonia, la categoria DEBE ser 'Servicios Publicos'.
              10. La categoria solo puede ser una de estas: Honorarios, Impuesto, Reembolso, Polizas, Seguridad Social, Nomina, Servicios Publicos.
              11. NO inventes IVA ni retefuente. Si no aparecen IVA ni retefuente y solo existe valor total a pagar, usa ese mismo valor como 'subtotal' y marca 'has_subtotal' en true.
              12. NO calcules IVA a partir del total, ni asumas porcentajes como 19%. Solo reporta IVA cuando la palabra IVA, impuesto o impuesto a las ventas aparezca explicita junto con su valor.
              13. Si el documento es de nomina, comprobante de pago, transferencia o desprendible, el proveedor/beneficiario ES la persona o entidad que recibe el pago, NO la empresa que paga.
              14. Si aparecen EMPRESA/PAGADOR y EMPLEADO/BENEFICIARIO, elige siempre EMPLEADO o BENEFICIARIO como 'name' y su documento como 'nit_id'.
              15. Si la cuenta de cobro cita el articulo 383 del Estatuto Tributario, conserva esa referencia en 'desc' para evaluar retefuente por rentas de trabajo.
              16. Extrae 'document_number' como el numero propio del soporte: numero de factura, cuenta de cobro, comprobante de nomina, desprendible o referencia principal del documento. No uses NIT, cedula, telefono, cuenta bancaria ni radicado interno.
              17. Nombre del archivo: ${file.name}`
            }
          ]
        },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              name: { type: Type.STRING },
              nit_id: { type: Type.STRING },
              document_type: {
                type: Type.STRING,
                description: 'Uno de: NIT, Cedula de Ciudadania, Cedula de Extranjeria, Tarjeta de Identidad, Pasaporte, Permiso Especial de Permanencia'
              },
              has_subtotal: {
                type: Type.BOOLEAN,
                description: 'true si el subtotal aparece explicito o si no hay IVA/retefuente y el subtotal equivale al total a pagar'
              },
              subtotal: { type: Type.NUMBER },
              has_iva: {
                type: Type.BOOLEAN,
                description: 'true solo si el IVA aparece explicito en el documento'
              },
              iva: { type: Type.NUMBER },
              has_retefuente: {
                type: Type.BOOLEAN,
                description: 'true solo si la retefuente aparece explicita en el documento'
              },
              retefuente: { type: Type.NUMBER },
              amount: { type: Type.NUMBER },
              document_number: {
                type: Type.STRING,
                description: 'Numero de factura, cuenta de cobro, comprobante de nomina, desprendible o referencia principal del documento'
              },
              date: {
                type: Type.STRING,
                description: 'Fecha de emision o expedicion del documento en formato YYYY-MM-DD'
              },
              due_date: {
                type: Type.STRING,
                description: 'Fecha de vencimiento o pago oportuno de la factura en formato YYYY-MM-DD. Vacio si no aparece explicitamente.'
              },
              desc: { type: Type.STRING },
              category: {
                type: Type.STRING,
                description: 'Una de: Honorarios, Impuesto, Reembolso, Polizas, Seguridad Social, Nomina, Servicios Publicos'
              },
              bank: { type: Type.STRING },
              account: { type: Type.STRING },
              mail: { type: Type.STRING },
              telefono: { type: Type.STRING, description: 'Solo numeros' },
              direccion: { type: Type.STRING, description: 'Direccion fisica completa' }
            }
          }
        }
      });

      const result = JSON.parse(response.text || '{}');
      const detectedDocumentDate = normalizeAiDate(result.date);
      const detectedDueDate = normalizeAiDate(result.due_date);
      const detectedProviderName = sanitizeTextField(result.name);
      const detectedMail = sanitizeTextField(result.mail);
      const detectedDescription = sanitizeTextField(result.desc);
      const detectedDocumentNumber = sanitizeTextField(result.document_number);
      const detectedIdentification = result.nit_id ? cleanId(result.nit_id) : '';
      const detectedCategory = inferCategory(result.category, detectedProviderName, detectedDescription, detectedMail);
      const detectedDocumentType = inferDocumentType(result.document_type, detectedIdentification, detectedProviderName, detectedMail);
      const hasExplicitTaxBreakdown = result.has_subtotal || result.has_retefuente;
      const rawDetectedIva = normalizeAmount(result.iva);
      const rawDetectedReteFuente = normalizeAmount(result.retefuente);
      const detectedIva = result.has_iva || rawDetectedIva > 0 ? rawDetectedIva : 0;
      const detectedReteFuente = result.has_retefuente || rawDetectedReteFuente > 0 ? rawDetectedReteFuente : 0;
      const detectedAmount = normalizeAmount(result.amount);
      const rawDetectedSubtotal = normalizeAmount(result.subtotal);
      const detectedSubtotal =
        rawDetectedSubtotal > 0
          ? rawDetectedSubtotal
          : detectedIva === 0 && detectedReteFuente === 0 && detectedAmount > 0
            ? detectedAmount
            : 0;
      const matchedProviderFromAiId = findProviderByIdentification(detectedIdentification);
      const matchedProviderFromFileName = extractFileIdentificationCandidates(file.name)
        .map((candidate) => findProviderByIdentification(candidate))
        .find(Boolean);
      const fallbackDirectoryProvider =
        isOwnCompanyDetection(detectedProviderName, detectedIdentification) || !matchedProviderFromAiId
          ? matchedProviderFromFileName || matchedProviderFromAiId
          : matchedProviderFromAiId;
      const finalProviderName = fallbackDirectoryProvider?.nombre || detectedProviderName;
      const finalIdentification = fallbackDirectoryProvider?.identificacion || detectedIdentification;
      const finalDocumentType =
        fallbackDirectoryProvider?.tipoDocumento ||
        inferDocumentType(result.document_type, finalIdentification, finalProviderName, detectedMail);

      setFormData((prev) => ({
        ...prev,
        proveedor: finalProviderName || prev.proveedor,
        identificacion: finalIdentification || prev.identificacion,
        subtotal: detectedSubtotal,
        iva: detectedIva,
        retefuente: detectedReteFuente,
        valor: detectedAmount || prev.valor,
        numeroDocumento: detectedDocumentNumber || prev.numeroDocumento,
        fechaDocumento: detectedDocumentDate || prev.fechaDocumento,
        fechaPago: detectedDueDate || getLastBusinessDayOfMonthIso(detectedDocumentDate || prev.fechaDocumento),
        descripcion: detectedDescription || prev.descripcion,
        categoria: detectedCategory || prev.categoria
      }));
      setIsPaymentDateTouched(Boolean(detectedDueDate));

      setProviderData((prev) => ({
        ...prev,
        tipoDocumento: finalDocumentType || prev.tipoDocumento,
        entidadBancaria: fallbackDirectoryProvider?.entidadBancaria || sanitizeTextField(result.bank) || prev.entidadBancaria,
        numeroCuenta: fallbackDirectoryProvider?.numeroCuenta || sanitizeTextField(result.account) || prev.numeroCuenta,
        correo: fallbackDirectoryProvider?.correo || detectedMail || prev.correo,
        telefono: fallbackDirectoryProvider?.telefono || sanitizeTextField(result.telefono) || prev.telefono,
        direccion: fallbackDirectoryProvider?.direccion || sanitizeTextField(result.direccion) || prev.direccion
      }));

      if (fallbackDirectoryProvider) {
        setIsAutoFilled(true);
      }

      setIsUploading(true);
      const supportFile = await uploadFileToSupabase(file);
      setSupports((prev) => [...prev, supportFile]);
      setIsAutoFilled(true);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Error analizando documento');
    } finally {
      setIsAiLoading(false);
      setIsUploading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    setIsUploading(true);
    try {
      const newFiles: SupportFile[] = [];
      for (let i = 0; i < files.length; i += 1) {
        const support = await uploadFileToSupabase(files[i]);
        newFiles.push(support);
      }
      setSupports((prev) => [...prev, ...newFiles]);
    } catch (error: any) {
      alert(error.message || 'Error al subir archivos');
    } finally {
      setIsUploading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isUploading) {
      alert('Espere a que terminen de cargar los archivos.');
      return;
    }

    const currentSubtotal = normalizeAmount(formData.subtotal);
    const currentIva = normalizeAmount(formData.iva);
    const currentReteFuente = normalizeAmount(formData.retefuente);
    const currentValue = normalizeAmount(formData.valor);
    const subtotalToSave =
      currentSubtotal > 0 ? currentSubtotal : currentIva === 0 && currentReteFuente === 0 ? currentValue : 0;
    const payableAmount = hasTaxBreakdown(subtotalToSave, currentIva, currentReteFuente)
      ? calculatePayableAmount(subtotalToSave, currentIva, currentReteFuente)
      : currentValue;

    const record: PaymentRecord = {
      id: initialData?.id || crypto.randomUUID(),
      radicado: initialData?.radicado || `RAD-${nextRadicado}`,
      mesContable: formData.mesContable || '',
      fechaDocumento: formData.fechaDocumento || '',
      fechaPago: formData.fechaPago || '',
      numeroDocumento: sanitizeTextField(formData.numeroDocumento),
      proveedor: formData.proveedor || '',
      identificacion: cleanId(formData.identificacion || ''),
      categoria: (formData.categoria as Category) || Category.Honorarios,
      descripcion: formData.descripcion || '',
      subtotal: subtotalToSave,
      iva: currentIva,
      retefuente: currentReteFuente,
      valor: payableAmount,
      observacion: formData.observacion || '',
      estado: (formData.estado as PaymentStatus) || PaymentStatus.Radicado,
      supports,
      comprobantePago: formData.comprobantePago,
      motivoDevolucion: formData.motivoDevolucion,
      createdAt: initialData?.createdAt || Date.now(),
    };

    const provider: Provider = {
      identificacion: record.identificacion,
      nombre: record.proveedor,
      tipoDocumento: providerData.tipoDocumento || DocumentType.CC,
      correo: sanitizeTextField(providerData.correo),
      direccion: sanitizeTextField(providerData.direccion),
      telefono: sanitizeTextField(providerData.telefono),
      entidadBancaria: sanitizeTextField(providerData.entidadBancaria),
      numeroCuenta: sanitizeTextField(providerData.numeroCuenta),
      tipoCuenta: providerData.tipoCuenta || BankAccountType.Ahorros,
    };

    onSubmit({ record, provider });
  };

  return (
    <div className="bg-white rounded-[2rem] shadow-2xl border border-slate-200 max-w-6xl mx-auto overflow-hidden animate-in fade-in zoom-in-95 duration-500 mb-20">
      {(isAiLoading || isUploading) && (
        <div className="absolute inset-0 z-[100] bg-white/80 backdrop-blur-xl flex items-center justify-center">
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl border border-slate-100 flex flex-col items-center max-w-xs text-center">
            <div className="w-16 h-16 border-4 border-slate-900 border-t-indigo-600 rounded-full animate-spin mb-8"></div>
            <p className="font-black text-slate-900 text-xl tracking-tighter uppercase">
              {isAiLoading ? 'IA Analizando Factura' : 'Sincronizando Archivos'}
            </p>
            <p className="text-xs text-slate-400 mt-3 font-bold uppercase tracking-widest leading-relaxed">
              Protegiendo la integridad de tus datos maestros
            </p>
          </div>
        </div>
      )}

      <div className="bg-slate-50 p-8 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
            {initialData ? `Edicion de Tramite: ${initialData.radicado}` : `Nuevo Radicado de Pago: RAD-${nextRadicado}`}
          </h3>
          <p className="text-[10px] text-slate-500 font-black uppercase tracking-[0.2em] mt-1 italic">
            Ingenieria 365 • Gestion de Egresos
          </p>
        </div>
        {!initialData && (
          <label
            className={`relative flex items-center space-x-3 px-8 py-4 rounded-2xl font-black text-xs uppercase tracking-widest cursor-pointer transition-all ${
              isAiLoading ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-black shadow-xl hover:-translate-y-1 active:scale-95'
            }`}
          >
            <span>✨ Escaneo Inteligente</span>
            <input type="file" accept="application/pdf,image/*" className="hidden" onChange={handleAiScan} disabled={isAiLoading} />
          </label>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-10 space-y-12">
        <div className="space-y-8">
          <div className="flex items-center space-x-3 border-b-4 border-indigo-600 pb-3 w-fit pr-12">
            <span className="text-2xl">🏛️</span>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Informacion Maestra del Proveedor</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
            <div className="md:col-span-4">
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Identificacion Fiscal</label>
              <input
                type="text"
                name="identificacion"
                value={formData.identificacion}
                onChange={handleInputChange}
                className="w-full px-5 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl focus:border-indigo-600 focus:bg-white outline-none font-black font-mono text-slate-900 text-sm transition-all shadow-sm"
                placeholder="NIT / CEDULA"
                required
              />
            </div>
            <div className="md:col-span-8">
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Beneficiario / Razon Social</label>
              <div className="relative">
                <input
                  type="text"
                  name="proveedor"
                  value={formData.proveedor}
                  onChange={handleInputChange}
                  className={`w-full px-5 py-4 border-2 rounded-2xl focus:border-indigo-600 outline-none transition-all uppercase font-black text-sm shadow-sm ${
                    isAutoFilled ? 'bg-indigo-50 border-indigo-200 text-indigo-900' : 'border-slate-100 bg-white'
                  }`}
                  placeholder="NOMBRE COMPLETO DE LA ENTIDAD"
                  required
                />
                {isAutoFilled && (
                  <span className="absolute -top-3 right-6 bg-indigo-600 text-white text-[9px] px-3 py-1 rounded-full uppercase font-black shadow-lg">
                    Validado en Directorio
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-6 bg-slate-50 p-8 rounded-[2rem] border border-slate-100 shadow-inner">
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Tipo de Documento</label>
              <select name="tipoDocumento" value={providerData.tipoDocumento} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-black outline-none bg-white">
                {Object.values(DocumentType).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Email Corporativo</label>
              <input type="email" name="correo" value={sanitizeTextField(providerData.correo)} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold outline-none bg-white" placeholder="tesoreria@empresa.com" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Telefono Principal</label>
              <input type="text" name="telefono" value={providerData.telefono} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-mono font-black outline-none bg-white" placeholder="Unicamente numeros" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-slate-400 mb-2 uppercase tracking-tighter">Direccion Fisica</label>
              <input type="text" name="direccion" value={providerData.direccion} onChange={handleProviderInputChange} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-xs font-bold outline-none bg-white" placeholder="Calle/Carrera/Nomenclatura" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 bg-slate-900 p-8 rounded-[2rem] shadow-2xl">
            <div>
              <label className="block text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest">Entidad Bancaria</label>
              <input type="text" name="entidadBancaria" value={providerData.entidadBancaria} onChange={handleProviderInputChange} className="w-full px-5 py-4 border-2 border-slate-800 bg-slate-800 text-white rounded-2xl text-xs font-black uppercase outline-none focus:border-indigo-600 transition-all" placeholder="NOMBRE DEL BANCO" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest">Numero de Cuenta</label>
              <input type="text" name="numeroCuenta" value={providerData.numeroCuenta} onChange={handleProviderInputChange} className="w-full px-5 py-4 border-2 border-slate-800 bg-slate-800 text-white rounded-2xl text-lg font-mono font-black tracking-widest outline-none focus:border-indigo-600 transition-all" placeholder="0000000000" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-indigo-400 mb-2 uppercase tracking-widest">Tipo de Cuenta</label>
              <select name="tipoCuenta" value={providerData.tipoCuenta} onChange={handleProviderInputChange} className="w-full px-5 py-4 border-2 border-slate-800 bg-slate-800 text-white rounded-2xl text-xs font-black outline-none focus:border-indigo-600 transition-all">
                {Object.values(BankAccountType).map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div className="space-y-8 pt-6">
          <div className="flex items-center space-x-3 border-b-4 border-slate-900 pb-3 w-fit pr-12">
            <span className="text-2xl">📈</span>
            <h4 className="text-sm font-black text-slate-900 uppercase tracking-widest">Concepto y Ejecucion Presupuestal</h4>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Categoria del Gasto</label>
              <select name="categoria" value={formData.categoria} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-slate-900 transition-all shadow-sm">
                {Object.values(Category).map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Periodo Contable</label>
              <input type="text" name="mesContable" value={formData.mesContable} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black uppercase outline-none focus:border-slate-900 transition-all shadow-sm" required />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Subtotal</label>
              <input type="number" name="subtotal" value={formData.subtotal ?? 0} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-900 outline-none focus:border-slate-900 transition-all shadow-sm" placeholder="0.00" />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">IVA</label>
              <input type="number" name="iva" value={formData.iva ?? 0} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-900 outline-none focus:border-slate-900 transition-all shadow-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Retefuente</label>
              <input type="number" name="retefuente" value={formData.retefuente ?? 0} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-sm font-black text-slate-900 outline-none focus:border-slate-900 transition-all shadow-sm" placeholder="0.00" />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Importe Total a Pagar</label>
              <input
                type="number"
                name="valor"
                value={formData.valor}
                onChange={handleInputChange}
                readOnly={hasTaxBreakdown(formData.subtotal, formData.iva, formData.retefuente)}
                className={`w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-xl font-black text-indigo-900 outline-none focus:border-slate-900 transition-all shadow-sm ${
                  hasTaxBreakdown(formData.subtotal, formData.iva, formData.retefuente) ? 'bg-indigo-50/70 cursor-not-allowed' : ''
                }`}
                placeholder="0.00"
                required
              />
            </div>
          </div>

          <div className="rounded-[1.5rem] border border-amber-200 bg-amber-50/70 p-6 shadow-sm">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="rounded-full bg-amber-500 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-white shadow-sm">
                    Sugerencia retefuente {taxYear}
                  </span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-amber-800">
                    UVT {activeUvtYear}: {formatCOP(activeUvtValue)}
                  </span>
                </div>
                {isUvtOutdated && (
                  <p className="rounded-xl border border-rose-200 bg-white px-4 py-3 text-[11px] font-black leading-relaxed text-rose-700">
                    No hay UVT configurada para {taxYear}. Se esta usando provisionalmente la UVT {activeUvtYear}; actualiza
                    UVT_BY_YEAR cuando la DIAN publique el nuevo valor.
                  </p>
                )}
                {retentionSuggestion ? (
                  <div className="space-y-2">
                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">
                      {retentionSuggestion.concept}: {retentionSuggestion.rateLabel}
                    </p>
                    <p className="text-xs font-bold leading-relaxed text-slate-700">
                      Base sugerida: {formatCOP(retentionBase)}. Base minima: {getMinimumLabel(retentionSuggestion)}.{' '}
                      {retentionSuggestion.rate
                        ? retentionBase >= retentionMinimumAmount
                          ? `Retencion estimada: ${formatCOP(suggestedRetentionValue)}.`
                          : 'La base actual no alcanza el minimo de la tabla anexa.'
                        : 'Este concepto requiere validacion manual.'}
                    </p>
                    {retentionSuggestion.note && (
                      <p className="text-[11px] font-bold leading-relaxed text-amber-900">{retentionSuggestion.note}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs font-bold leading-relaxed text-slate-700">
                    Completa la categoria, descripcion y valor para ver una sugerencia de retencion segun la tabla anexa.
                  </p>
                )}
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-500">
                  Sugerencia informativa. Valida soporte, calidad tributaria y acumulados antes de pagar.
                </p>
              </div>
              <div className="flex flex-wrap gap-3 lg:justify-end">
                {retentionSuggestion?.rate && retentionBase >= retentionMinimumAmount && (
                  <button
                    type="button"
                    onClick={applySuggestedRetention}
                    className="rounded-2xl bg-slate-900 px-5 py-3 text-[10px] font-black uppercase tracking-widest text-white shadow-lg transition-all hover:-translate-y-0.5 hover:bg-black active:scale-95"
                  >
                    Usar sugerencia
                  </button>
                )}
                <a
                  href={TAX_STATUTE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-2xl border border-amber-300 bg-white px-5 py-3 text-[10px] font-black uppercase tracking-widest text-amber-800 shadow-sm transition-all hover:-translate-y-0.5 hover:border-amber-500 hover:text-amber-950"
                >
                  Ver Estatuto Tributario
                </a>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="grid grid-cols-2 gap-6 md:col-span-1">
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Fecha Documento</label>
                <input type="date" name="fechaDocumento" value={formData.fechaDocumento} onChange={handleInputChange} className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-slate-900 shadow-sm" required />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Fecha Pago Estimada</label>
                <input type="date" name="fechaPago" value={formData.fechaPago} onChange={handleInputChange} className="w-full px-4 py-4 border-2 border-slate-100 rounded-2xl text-xs font-black outline-none focus:border-slate-900 shadow-sm" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">No. Factura / Comprobante</label>
              <input
                type="text"
                name="numeroDocumento"
                value={formData.numeroDocumento || ''}
                onChange={handleInputChange}
                className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-sm font-black uppercase outline-none focus:border-slate-900 shadow-sm"
                placeholder="FACT-001 / CC-001"
                required
              />
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 mb-2 uppercase tracking-widest">Descripcion del Tramite</label>
              <input type="text" name="descripcion" value={formData.descripcion} onChange={handleInputChange} className="w-full px-5 py-4 border-2 border-slate-100 rounded-2xl text-sm font-bold outline-none focus:border-slate-900 shadow-sm" placeholder="Resumen del concepto de cobro..." required />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 pt-12 border-t border-slate-100">
          <div className="space-y-6">
            <label className="block text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Soportes Documentales ({supports.length})</label>
            <div className="border-4 border-dashed border-slate-100 rounded-[2rem] p-12 flex flex-col items-center hover:bg-slate-50 transition-all cursor-pointer relative group">
              <span className="text-5xl mb-4 group-hover:scale-110 transition-transform duration-300">📁</span>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Haz clic o arrastra archivos para cargarlos en la nube</span>
              <input type="file" multiple onChange={handleFileChange} className="absolute inset-0 opacity-0 cursor-pointer" />
            </div>
            <div className="flex flex-wrap gap-3 mt-6">
              {supports.map((support) => (
                <span key={support.id} className="px-5 py-3 bg-slate-900 text-white text-[10px] font-black rounded-2xl flex items-center shadow-xl animate-in zoom-in-50">
                  <span className="truncate max-w-[140px]">{support.name}</span>
                  <button type="button" onClick={() => setSupports((prev) => prev.filter((file) => file.id !== support.id))} className="ml-4 text-rose-500 font-black text-lg hover:scale-125 transition-all">
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <label className="block text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Estado del Radicado</label>
            <div className="flex space-x-3 bg-slate-50 p-3 rounded-[1.5rem] border border-slate-100 shadow-inner">
              {Object.values(PaymentStatus).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, estado: status }))}
                  className={`flex-1 py-5 rounded-xl text-[10px] font-black transition-all transform active:scale-95 shadow-md uppercase tracking-widest ${
                    formData.estado === status
                      ? status === PaymentStatus.Pagado
                        ? 'bg-emerald-600 text-white shadow-emerald-200'
                        : status === PaymentStatus.Devuelto
                          ? 'bg-rose-600 text-white shadow-rose-200'
                          : 'bg-slate-900 text-white shadow-slate-200'
                      : 'bg-white text-slate-400 hover:bg-slate-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
            <textarea name="observacion" value={formData.observacion} onChange={handleInputChange} rows={4} className="w-full px-6 py-5 border-2 border-slate-100 rounded-[1.5rem] text-xs font-medium outline-none focus:border-slate-900 shadow-sm" placeholder="Observaciones adicionales de tesoreria..." />
          </div>
        </div>

        <div className="flex justify-end space-x-6 pt-12 border-t border-slate-100">
          <button type="button" onClick={onCancel} className="px-10 py-5 text-slate-400 font-black text-xs uppercase tracking-[0.2em] hover:text-slate-900 transition-colors">
            Descartar
          </button>
          <button
            type="submit"
            disabled={isUploading}
            className={`px-16 py-5 ${isUploading ? 'bg-slate-300 cursor-not-allowed' : 'bg-slate-900 hover:bg-black'} text-white font-black rounded-2xl shadow-2xl transition-all transform hover:-translate-y-2 active:scale-95 text-xs uppercase tracking-[0.2em]`}
          >
            {initialData ? 'Guardar Cambios' : 'Generar Radicado'}
          </button>
        </div>
      </form>
    </div>
  );
};
