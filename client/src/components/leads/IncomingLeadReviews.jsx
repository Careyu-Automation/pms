import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '../ui/Button';
import { listLeads } from '../../services/leads.service';
import '../../styles/lead.css';

export function IncomingLeadReviews() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState([]);

  useEffect(() => {
    let active = true;
    listLeads()
      .then((payload) => {
        if (active) {
          setLeads(payload.data.leads.filter((item) => item.status === 'SUBMITTED_TO_PM'));
        }
      })
      .catch(() => {
        if (active) setLeads([]);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!leads.length) return null;

  return (
    <section className="lead-incoming" aria-label="New leads submitted to the project manager">
      <h2>New lead submitted</h2>
      <div className="lead-incoming__grid">
        {leads.map((item) => (
          <article key={item.id} className="lead-incoming__card">
            <p className="lead-code">{item.leadCode}</p>
            <h3>{item.title || 'Untitled lead'}</h3>
            <p>{item.customerName || 'Customer not set'}</p>
            <p>Submitted by {item.submittedBy || item.createdBy}</p>
            <p>Pending PM review</p>
            <Button size="sm" onClick={() => navigate(`/lead-pipeline/${item.id}`)}>Review lead</Button>
          </article>
        ))}
      </div>
    </section>
  );
}
