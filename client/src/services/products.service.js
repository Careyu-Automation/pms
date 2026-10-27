import { api } from './api';

export function listProducts() {
  return api('/products');
}

export function getProduct(id) {
  return api(`/products/${id}`);
}

export function createProduct(body) {
  return api('/products', { method: 'POST', body });
}

export function updateProduct(id, body) {
  return api(`/products/${id}`, { method: 'PUT', body });
}

export function deleteProduct(id) {
  return api(`/products/${id}`, { method: 'DELETE' });
}
