export const validateEmail = (email: string): boolean => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

export const validatePassword = (password: string): boolean => {
  return password.length >= 4;
};

export const validateRequired = (value: string): boolean => {
  return value.trim().length > 0;
};

export const validateEmployeeForm = (data: {
  name: string;
  email: string;
  password: string;
  department: string;
  position: string;
}): { isValid: boolean; error?: string } => {
  if (!validateRequired(data.name)) {
    return { isValid: false, error: 'El nombre es obligatorio' };
  }
  
  if (!validateEmail(data.email)) {
    return { isValid: false, error: 'Email inválido' };
  }
  
  if (!validatePassword(data.password)) {
    return { isValid: false, error: 'La contraseña debe tener al menos 4 caracteres' };
  }
  
  if (!validateRequired(data.department)) {
    return { isValid: false, error: 'El departamento es obligatorio' };
  }
  
  if (!validateRequired(data.position)) {
    return { isValid: false, error: 'La posición es obligatoria' };
  }
  
  return { isValid: true };
};