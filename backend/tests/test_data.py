"""Состав тестовых данных (таблица 28) и синтетичность (NFR1)."""

import json


def test_seed_counts(db):
    c = db.counts()
    assert c["clients"] == 15
    assert c["products"] == 5
    assert c["client_products"] == 28
    assert c["tasks"] == 20
    assert c["conversations"] == 20
    assert c["messages"] == 110
    assert c["insights"] == 19
    assert c["crm_notes"] == 4
    assert c["follow_ups"] == 4
    assert c["feedback"] == 7
    assert c["managers"] == 2


def test_clients_split_between_managers(db):
    assert len(db.get_clients_by_manager("m1")) == 9
    assert len(db.get_clients_by_manager("m2")) == 6


def test_messages_ordered_chronologically(db):
    msgs = db.get_messages("conv1")
    times = [m["sentAtIso"] for m in msgs]
    assert times == sorted(times)


def test_no_real_contacts_in_clients(db):
    # NFR1: синтетические данные — нет email/телефонов в профилях клиентов.
    for cl in db.get_clients():
        blob = json.dumps(cl, ensure_ascii=False)
        assert "@" not in blob
        assert "+7" not in blob
