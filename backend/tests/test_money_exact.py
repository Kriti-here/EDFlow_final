from decimal import Decimal

from app import models


def test_money_survives_sqlite_exactly(db_session):
    p = models.Payment(paypal_capture_id="EXACT1", gross=Decimal("9999999999999.9999"),
                       net=Decimal("47.34"), fx_rate=Decimal("83.123456789012"))
    db_session.add(p)
    db_session.commit()
    db_session.expire_all()
    q = db_session.get(models.Payment, p.id)
    assert (q.gross, q.net, q.fx_rate) == (Decimal("9999999999999.9999"), Decimal("47.34"),
                                           Decimal("83.123456789012"))
    assert str(q.net) == "47.34"