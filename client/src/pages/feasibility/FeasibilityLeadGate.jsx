import { useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Loader } from '../../components/ui/Loader';
import { useToast } from '../../context/ToastContext';
import { ensureStudy } from '../../services/feasibility.service';

export default function FeasibilityLeadGate() {
  const { leadId } = useParams();
  const navigate = useNavigate();
  const { push } = useToast();

  useEffect(() => {
    let active = true;
    ensureStudy(leadId)
      .then((payload) => {
        if (active) navigate(`/feasibility-studies/${payload.data.study.id}`, { replace: true });
      })
      .catch((error) => {
        if (!active) return;
        push({ tone: 'danger', message: error.message });
        navigate('/feasibility-studies', { replace: true });
      });
    return () => {
      active = false;
    };
  }, [leadId, navigate, push]);

  return <Loader label="Opening feasibility study" />;
}
