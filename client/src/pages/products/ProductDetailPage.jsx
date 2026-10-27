import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ProductForm } from '../../components/products/ProductForm';
import { PRODUCT_PRIORITY, PRODUCT_STATUS, productToForm, validateProduct, withCurrentLead } from '../../components/products/productModel';
import { PageContainer } from '../../components/layout/PageContainer';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { ErrorState } from '../../components/ui/ErrorState';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../context/ToastContext';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';
import { deleteProduct, getProduct, updateProduct } from '../../services/products.service';
import { formatDate } from '../../utils/format';
import '../../styles/lead.css';
import '../../styles/products.css';

function failureMessage(error, fallback) {
  console.error(fallback, error);
  if (error.status === 401) return 'Your session has expired. Please sign in again.';
  if (error.status === 403) return error.message || 'You do not have permission to change products.';
  if (error.status === 400 || error.status === 409) return error.message;
  if (!error.status || error.status >= 500) return fallback;
  return error.message || fallback;
}

export default function ProductDetailPage() {
  const { productId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();
  const [product, setProduct] = useState(null);
  const [teams, setTeams] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [leads, setLeads] = useState([]);
  const [access, setAccess] = useState({ canEdit: false, canDelete: false });
  const [status, setStatus] = useState('loading');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(null);
  const [serverErrors, setServerErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  useDocumentTitle(product?.name || 'Product');

  const load = useCallback(() => {
    setStatus('loading');
    return getProduct(productId)
      .then((payload) => {
        setProduct(payload.data.product);
        setTeams(payload.data.teams || []);
        setDepartments(payload.data.departments || []);
        setLeads(payload.data.leads || []);
        setAccess(payload.data.access || { canEdit: false, canDelete: false });
        setStatus('ready');
      })
      .catch((error) => {
        setStatus(error.status === 404 ? 'missing' : 'error');
        if (error.status !== 404) push({ tone: 'danger', message: error.message });
      });
  }, [productId, push]);

  useEffect(() => { load(); }, [load]);

  function openEdit() {
    setServerErrors({});
    setForm(productToForm(product));
    setEditing(true);
  }

  async function submit(event) {
    event.preventDefault();
    if (!form || Object.keys(validateProduct(form)).length || busy) return;
    setBusy(true);
    setServerErrors({});
    try {
      const payload = await updateProduct(product.id, form);
      setProduct(payload.data.product);
      setEditing(false);
      push({ tone: 'success', message: 'Product updated.' });
    } catch (error) {
      if (error.details?.fields) setServerErrors(error.details.fields);
      push({ tone: 'danger', message: failureMessage(error, 'Unable to update product. Please try again.') });
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (busy) return;
    setBusy(true);
    try {
      await deleteProduct(product.id);
      push({ tone: 'success', message: 'Product deleted.' });
      navigate('/products');
    } catch (error) {
      push({ tone: 'danger', message: failureMessage(error, 'Unable to delete product. Please try again.') });
      setBusy(false);
    }
  }

  return (
    <PageContainer>
      <Link className="products-detail__back" to="/products">Products</Link>
      {status === 'loading' ? <div className="products-skeleton" aria-hidden="true" /> : null}
      {status === 'missing' ? <ErrorState title="Product not found." description="This product is no longer available." action={<Button onClick={() => navigate('/products')}>Back to products</Button>} /> : null}
      {status === 'error' ? <ErrorState title="Product could not be loaded." action={<Button onClick={load}>Retry</Button>} /> : null}
      {status === 'ready' && product ? (
        <article className="products-detail">
          <div className="products-detail__top">
            <h2>{product.name}</h2>
            <Badge>{PRODUCT_STATUS[product.status] || product.status}</Badge>
            <Badge>{PRODUCT_PRIORITY[product.priority] || product.priority}</Badge>
          </div>
          <span className="products-code">{product.productCode}</span>
          <span>{product.teamName || 'No team'}</span>
          <span>{product.department || 'No department'}</span>
          <span>Start: {formatDate(product.startDate)}</span>
          <span>End: {formatDate(product.endDate)}</span>
          <span>{product.leadCode ? `Lead: ${product.leadCode}` : 'Internal Product'}</span>
          {product.description ? <p>{product.description}</p> : null}
          <div className="products-actions">
            {access.canEdit ? <Button size="sm" variant="secondary" onClick={openEdit}>Edit</Button> : null}
            {access.canDelete ? <Button size="sm" variant="danger" onClick={() => setPendingDelete(true)}>Delete</Button> : null}
          </div>
        </article>
      ) : null}

      <Modal open={editing} className="products-dialog" title="Edit Product" onClose={() => { if (!busy) setEditing(false); }}>
        {editing && form ? (
          <ProductForm
            mode="edit"
            form={form}
            setForm={(value) => {
              setServerErrors({});
              setForm(value);
            }}
            teams={teams}
            departments={departments}
            leads={withCurrentLead(leads, product)}
            serverErrors={serverErrors}
            busy={busy}
            onCancel={() => setEditing(false)}
            onSubmit={submit}
          />
        ) : null}
      </Modal>
      <Modal open={pendingDelete} title="Delete Product?" onClose={() => { if (!busy) setPendingDelete(false); }}>
        <p>Are you sure you want to delete this product?</p>
        <div className="products-form__actions">
          <Button variant="secondary" onClick={() => setPendingDelete(false)} disabled={busy}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete} loading={busy}>Delete Product</Button>
        </div>
      </Modal>
    </PageContainer>
  );
}
