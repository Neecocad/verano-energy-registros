// Configuración del proyecto y catálogos para los formularios de registro
// individual (uno por transecto / parcela / calicata) — Verano Energy.
// Complementa (no reemplaza) al formulario de avance agregado del otro repo.

export const PROYECTO = {
  project_id: 'VERANO_ENERGY',
  nombre_proyecto: 'Verano Energy',
  huso_utm: '19S',
};

// Personas evaluadoras autorizadas. Juan Araya va al final del listado; después
// de ellas el formulario agrega la opción "Otro (especificar)" para escribir
// iniciales o un nombre libre cuando quien evalúa no está en el catálogo.
export const RESPONSABLES = [
  'Bárbara Aros',
  'Sabina Madariaga',
  'María Paz Quiroz',
  'Juan Araya',
];

// Valor que activa el campo de texto libre en los dropdowns que lo admiten.
export const OPCION_OTRO = 'Otro (especificar)';

// Cantidad total de unidades por EDT (1 por hectárea → 177).
export const TOTAL_UNIDADES = 177;

// Catálogos de opciones (dropdowns) de los formularios.
export const TIPOS_VEGETACION = ['Cultivo', 'Pradera', 'Matorral', 'Bosque', OPCION_OTRO];
export const ESTADOS_FENOLOGICOS = ['Latencia', 'Brote', 'Floración'];
export const ESTADOS_SANITARIOS = ['Óptimo', 'Regular', 'Vulnerable'];

// Tipos de indicio para los elementos encontrados en la parcela (EDT 6.2).
export const TIPOS_INDICIO = [
  'Cururera', 'Huella', 'Fecas', 'Madriguera', 'Sendero', 'Resto óseo', OPCION_OTRO,
];

// Definición de los 3 formularios de registro individual.
export const FORMULARIOS = {
  '6.1': { codigo_edt: '6.1', nombre: 'Zona y Transecto', unidad_singular: 'Transecto', campo_unidad: 'transecto' },
  '6.2': { codigo_edt: '6.2', nombre: 'Parcela', unidad_singular: 'Parcela', campo_unidad: 'parcela' },
  '6.3': { codigo_edt: '6.3', nombre: 'Calicata', unidad_singular: 'Calicata', campo_unidad: 'calicata' },
};
