// Configuración del proyecto y catálogos para los formularios de registro
// individual (uno por transecto / parcela / calicata) — Verano Energy.
// Complementa (no reemplaza) al formulario de avance agregado del otro repo.

export const PROYECTO = {
  project_id: 'VERANO_ENERGY',
  nombre_proyecto: 'Verano Energy',
  huso_utm: '19S',
};

// Catálogos de "Persona evaluadora" — diferenciados por EDT. Juan Araya solo
// participa en calicatas (6.3); no debe poder seleccionarse en 6.1/6.2.
export const OTRA_PERSONA = 'Otra persona';

export const RESPONSABLES_POR_EDT = {
  '6.1': ['Sabina Madariaga', 'Bárbara Aros', 'María Paz Quiroz', OTRA_PERSONA],
  '6.2': ['Sabina Madariaga', 'Bárbara Aros', 'María Paz Quiroz', OTRA_PERSONA],
  '6.3': ['Sabina Madariaga', 'Bárbara Aros', 'Juan Araya', 'María Paz Quiroz', OTRA_PERSONA],
};

// Cantidad total de unidades por EDT (1 por hectárea → 177).
export const TOTAL_UNIDADES = 177;

// Catálogos de opciones (dropdowns) de los formularios.
export const TIPOS_VEGETACION = ['Cultivo', 'Pradera', 'Matorral', 'Bosque', 'Otro (especificar)'];
export const ESTADOS_FENOLOGICOS = ['Latencia', 'Brote', 'Floración'];
export const ESTADOS_SANITARIOS = ['Óptimo', 'Regular', 'Vulnerable'];

// Definición de los 3 formularios de registro individual.
export const FORMULARIOS = {
  '6.1': { codigo_edt: '6.1', nombre: 'Zona y Transecto', unidad_singular: 'Transecto', campo_unidad: 'transecto' },
  '6.2': { codigo_edt: '6.2', nombre: 'Parcela', unidad_singular: 'Parcela', campo_unidad: 'parcela' },
  '6.3': { codigo_edt: '6.3', nombre: 'Calicata', unidad_singular: 'Calicata', campo_unidad: 'calicata' },
};
