"""Offline tests (no network):  cd discord-carbot && python -m unittest discover tests"""
import json
import os
import shutil
import sys
import tempfile
import unittest
from datetime import date, datetime, timedelta

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
sys.path.insert(0, ROOT)

from carbot import commons, core, discover, discord_post, net, site  # noqa: E402
from carbot.__main__ import cmd_check, cmd_run  # noqa: E402


def fake_commons(car, offset=0, count=3):
    pool = [{"url": f"https://img.test/{car['id']}/{i}.jpg", "oldal": "https://commons.wikimedia.org/x",
             "szerzo": f"A{i} (CC BY-SA 4.0)"} for i in range(7)]
    if offset >= len(pool):
        offset = 0
    return pool[offset:offset + count], offset


class Base(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        shutil.copytree(os.path.join(ROOT, "cars"), os.path.join(self.tmp, "cars"))
        shutil.copy(os.path.join(ROOT, "config.json"), self.tmp)
        os.makedirs(os.path.join(self.tmp, "plan"))
        self._orig = commons.for_car
        commons.for_car = fake_commons
        core.commons.for_car = fake_commons
        self.bot = core.Bot(self.tmp)
        self.today = date(2026, 11, 12)

    def tearDown(self):
        commons.for_car = self._orig
        core.commons.for_car = self._orig
        shutil.rmtree(self.tmp)

    def edit(self, day, **kv):
        p = json.load(open(self.bot.path(day), encoding="utf-8"))
        p.update(kv)
        json.dump(p, open(self.bot.path(day), "w", encoding="utf-8"), ensure_ascii=False)


class TestCars(Base):
    def test_curated_valid(self):
        self.assertGreaterEqual(len(self.bot.cars), 200)
        self.assertEqual(cmd_check(self.bot), 0)


class TestPlan(Base):
    def test_nine_days_unique_numbered(self):
        changed = self.bot.refresh(self.today)
        self.assertEqual(len(changed), 9)
        posts = self.bot.all_posts()
        self.assertEqual(sorted(p["sorszam"] for p in posts.values()), list(range(1, 10)))
        self.assertEqual(len({p["auto_id"] for p in posts.values()}), 9)
        self.assertEqual(self.bot.refresh(self.today), [])            # idempotent: no rewrite
        self.assertEqual(self.bot.refresh(self.today + timedelta(days=1)), ["2026-11-21"])
        self.assertEqual(self.bot.all_posts()["2026-11-21"]["sorszam"], 10)

    def test_manual_edits(self):
        self.bot.refresh(self.today)
        d = "2026-11-13"
        old = self.bot.all_posts()[d]
        self.edit(d, muvelet="masik-auto")
        self.bot.refresh(self.today)
        p = self.bot.all_posts()[d]
        self.assertNotEqual(p["auto_id"], old["auto_id"])
        self.assertEqual(p["muvelet"], "")
        self.assertEqual(p["sorszam"], old["sorszam"])

        self.edit(d, auto_id="mazda-787b")                    # typed a car id
        self.bot.refresh(self.today)
        p = self.bot.all_posts()[d]
        self.assertEqual(p["auto_nev"], "Mazda 787B")
        self.assertEqual(p["szoveg"], self.bot.cars["mazda-787b"]["szoveg"])

        self.edit(d, muvelet="uj-kepek")
        self.bot.refresh(self.today)
        self.assertEqual(self.bot.all_posts()[d]["kep_offset"], 3)

        self.edit(d, kepek=["https://example.com/a.jpg", "nem-url"], szoveg="Saját szöveg")
        self.bot.refresh(self.today)
        p = self.bot.all_posts()[d]
        self.assertEqual([i["url"] for i in p["kepek"]], ["https://example.com/a.jpg"])
        self.assertEqual(p["szoveg"], "Saját szöveg")
        self.assertIsNone(p["figyelmeztetes"])

        self.edit(d, szoveg="x" * 181)
        self.bot.refresh(self.today)
        p = self.bot.all_posts()[d]
        self.assertIn("181", p["figyelmeztetes"])
        self.assertFalse(self.bot.sendable(p))

        self.edit(d, allapot="valami")
        self.bot.refresh(self.today)
        self.assertEqual(self.bot.all_posts()[d]["allapot"], "tervezett")

    def test_due(self):
        self.bot.refresh(self.today)
        tz = self.bot.tz
        before = datetime(2026, 11, 12, 8, 59, tzinfo=tz)
        after = datetime(2026, 11, 12, 9, 0, tzinfo=tz)
        self.assertEqual(self.bot.due(before), [])
        self.assertEqual([p["nap"] for p in self.bot.due(after)], ["2026-11-12"])
        self.bot.cfg["csak_jovahagyott"] = True
        self.assertEqual(self.bot.due(after), [])
        self.edit("2026-11-12", allapot="jovahagyott")
        self.assertEqual(len(self.bot.due(after)), 1)
        self.edit("2026-11-12", allapot="kihagy")
        self.assertEqual(self.bot.due(after), [])
        self.edit("2026-11-15", muvelet="kuldes-most")
        self.assertEqual([p["nap"] for p in self.bot.due(before)], ["2026-11-15"])


class TestPosting(Base):
    def test_embeds_gallery(self):
        self.bot.refresh(self.today)
        p = self.bot.all_posts()["2026-11-12"]
        e = discord_post.build_embeds(p, self.bot.cars[p["auto_id"]])
        self.assertEqual(len(e), 3)
        self.assertTrue(all(x["url"] == e[0]["url"] for x in e))
        self.assertIn("#1", e[0]["footer"]["text"])
        self.assertIn("Wikimedia Commons", e[0]["footer"]["text"])

    def test_run_posts_via_webhook(self):
        calls = []

        def fake_http(url, params=None, data=None, headers=None, method=None, **kw):
            calls.append((method, url, data))
            if method == "POST":
                return {"id": "111", "channel_id": "222"}
            return {"guild_id": "333"}

        orig, net.http = net.http, fake_http
        os.environ["DISCORD_WEBHOOK_URL"] = "https://discord.com/api/webhooks/1/abc"
        try:
            self.bot.now = lambda: datetime(2026, 11, 12, 9, 30, tzinfo=self.bot.tz)
            self.assertEqual(cmd_run(self.bot), 0)
            p = self.bot.all_posts()["2026-11-12"]
            self.assertEqual(p["allapot"], "kikuldve")
            self.assertEqual(p["link"], "https://discord.com/channels/333/222/111")
            self.assertEqual(calls[0][2]["username"], "Autós érdekességek")
            n = len(calls)
            cmd_run(self.bot)                       # second run same day: no repost
            self.assertEqual(len(calls), n)
        finally:
            net.http = orig
            del os.environ["DISCORD_WEBHOOK_URL"]

    def test_failure_marks_error(self):
        def boom(*a, **k):
            raise net.HttpError(403, "Missing Access", "https://discord.com/api/webhooks/x")

        orig, net.http = net.http, boom
        os.environ["DISCORD_WEBHOOK_URL"] = "https://discord.com/api/webhooks/1/abc"
        try:
            self.bot.now = lambda: datetime(2026, 11, 12, 10, 0, tzinfo=self.bot.tz)
            self.assertEqual(cmd_run(self.bot), 0)      # error is recorded, not a failing job
            p = self.bot.all_posts()["2026-11-12"]
            self.assertEqual((p["allapot"], p["probalkozas"]), ("hiba", 1))
        finally:
            net.http = orig
            del os.environ["DISCORD_WEBHOOK_URL"]


class TestImages(unittest.TestCase):
    def test_rank_prefers_model_words(self):
        mk = lambda n: {"url": "u", "oldal": "https://commons.wikimedia.org/wiki/File:" + n}  # noqa: E731
        r = commons.rank("Porsche 911 GT2 RS (991)", [mk("Porsche_911_Carrera_4S_(991).jpg"),
                                                    mk("Porsche_GT2_RS_IAA_2017.jpg"), mk("Porsche_RSR_1974.jpg")])
        self.assertEqual(r[0]["oldal"].rsplit(":", 1)[1], "Porsche_GT2_RS_IAA_2017.jpg")


class TestCommands(Base):
    def setUp(self):
        super().setUp()
        self.calls = []

        def fake_http(url, params=None, data=None, headers=None, method=None, **kw):
            self.calls.append(data)
            return {"id": str(len(self.calls)), "channel_id": "2"} if method == "POST" else {"guild_id": "3"}

        self._net, net.http = net.http, fake_http
        os.environ["DISCORD_WEBHOOK_URL"] = "https://discord.com/api/webhooks/1/abc"
        self.bot.now = lambda: datetime(2026, 11, 12, 7, 0, tzinfo=self.bot.tz)   # before 09:00
        self.bot.refresh(self.today)

    def tearDown(self):
        net.http = self._net
        os.environ.pop("DISCORD_WEBHOOK_URL", None)
        os.environ.pop("CARBOT_COMMAND", None)
        super().tearDown()

    def run_cmd(self, title):
        os.environ["CARBOT_COMMAND"] = title
        try:
            return cmd_run(self.bot)
        finally:
            os.environ.pop("CARBOT_COMMAND", None)

    def test_send_future_day_now_archives_and_refills(self):
        before = self.bot.all_posts()["2026-11-15"]
        self.assertEqual(self.run_cmd("carbot: kuldes-most 2026-11-15"), 0)
        self.assertEqual(len([c for c in self.calls if c]), 1)
        extra = self.bot.extra_posts()
        self.assertEqual(len(extra), 1)
        self.assertEqual((extra[0]["auto_id"], extra[0]["allapot"], extra[0]["kuldve_nap"]),
                         (before["auto_id"], "kikuldve", "2026-11-12"))
        new = self.bot.all_posts()["2026-11-15"]
        self.assertNotEqual(new["auto_id"], before["auto_id"])
        self.assertEqual(new["allapot"], "tervezett")
        self.assertEqual(new["sorszam"], 10)                    # numbering continues
        self.assertEqual(self.bot.all_posts()["2026-11-12"]["allapot"], "tervezett")   # today's still pending

    def test_time_commands(self):
        self.assertEqual(self.run_cmd("carbot: ido 2026-11-12 6:30"), 0)
        p = self.bot.all_posts()["2026-11-12"]
        self.assertEqual(p["kuldes_ideje"], "06:30")
        self.assertEqual(p["allapot"], "kikuldve")              # 07:00 > 06:30 -> sent in the same run
        self.assertEqual(self.run_cmd("carbot: alap-ido 18:45"), 0)
        self.assertEqual(json.load(open(os.path.join(self.tmp, "config.json")))["kuldes_ideje"], "18:45")
        self.assertEqual(core.Bot(self.tmp).post_time(self.bot.all_posts()["2026-11-13"]), "18:45")

    def test_other_commands_and_errors(self):
        self.run_cmd("carbot: kihagy 2026-11-14")
        self.assertEqual(self.bot.all_posts()["2026-11-14"]["allapot"], "kihagy")
        self.run_cmd("carbot: visszaallit 2026-11-14")
        self.assertEqual(self.bot.all_posts()["2026-11-14"]["allapot"], "tervezett")
        old = self.bot.all_posts()["2026-11-14"]["auto_id"]
        self.run_cmd("carbot: masik-auto 2026-11-14")
        self.assertNotEqual(self.bot.all_posts()["2026-11-14"]["auto_id"], old)
        self.assertEqual(self.run_cmd("carbot: valami 2026-11-14"), 1)
        self.assertEqual(self.run_cmd("carbot: kihagy 2030-01-01"), 1)
        self.assertEqual(self.run_cmd("carbot: ido 2026-11-14 25:00"), 1)
        self.assertEqual(self.calls, [])                        # nothing was posted


class TestSite(Base):
    def test_build(self):
        self.bot.now = lambda: datetime(2026, 11, 12, 7, 0, tzinfo=self.bot.tz)
        self.bot.refresh(self.today)
        out = os.path.join(self.tmp, "_site")
        site.build(self.bot, out, repo="Csabulator/Public")
        html = open(os.path.join(out, "carbot", "index.html"), encoding="utf-8").read()
        self.assertEqual(html.count('class="tile'), 9)
        self.assertIn("MA • 2026. 11. 12. csütörtök", html)
        self.assertIn("github.com/Csabulator/Public/edit/main/discord-carbot/plan/2026-11-12.json", html)
        self.assertTrue(os.path.exists(os.path.join(out, "index.html")))
        self.assertIn("issues/new?title=carbot%3A%20kuldes-most%202026-11-12", html)
        self.assertIn("carbot%3A%20ido%202026-11-12%2009%3A00", html)
        self.assertIn("🕘 09:00", html)


WIKITEXT = """{{Short description|Racing car}}
{{Infobox racing car
| Car_name = Lancia 037
| Production = 1982–1983
| Engine = [[Lancia]] 1,995 [[Cubic centimetre|cc]] [[Straight-four engine|inline-four]] [[supercharger|supercharged]], [[mid-engine|mid-mounted]]
| Power = {{convert|325|PS|kW hp|abbr=on}}<ref>test</ref>
| Torque = {{convert|333|Nm|lbft|abbr=on}}
| Weight = {{convert|960|kg|lb|abbr=on}}
}}
The '''Lancia 037''' is a ..."""


class TestDiscover(Base):
    def test_infobox_parse(self):
        f = discover.facts_from("Lancia 037 (rally car)", WIKITEXT)
        self.assertEqual(f["nev"], "Lancia 037")
        self.assertEqual(f["ev"], "1982")
        self.assertEqual(f["teljesitmeny"], "325 LE")
        self.assertEqual(f["nyomatek"], "333 Nm")
        self.assertEqual(f["tomeg"], "960 kg")
        self.assertEqual(f["motor"], "2,0 l kompresszoros soros 4")
        t = discover.template_text(f, "A B csoport őrült korszakának gyermeke", 180)
        self.assertTrue(t.startswith("Lancia 037 (1982) – 2,0 l kompresszoros soros 4, 325 LE, 333 Nm"))
        self.assertLessEqual(len(t), 180)

    def test_units(self):
        self.assertEqual(discover.power_le("500 kW"), "680 LE")
        self.assertEqual(discover.power_le("600 hp"), "608 LE")
        self.assertEqual(discover.torque_nm("400 lb⋅ft"), "542 Nm")
        self.assertEqual(discover.engine_hu("3.5 L twin-turbocharged V6 hybrid"), "3,5 l biturbó V6 + hibrid")

    def test_run_end_to_end(self):
        self.bot.cfg["felfedezes"] = {"kategoriak": [{"nev": "Group B cars", "cimke": "Rali – B csoport",
                                                      "mondat": "B csoport"}], "hetente": 2}

        def fake_http(url, params=None, **kw):
            p = params or {}
            if p.get("list") == "categorymembers":
                return {"query": {"categorymembers": [
                    {"ns": 0, "title": "Lancia 037"},           # already curated -> skipped
                    {"ns": 0, "title": "Fantasy Rally Car X"},
                    {"ns": 0, "title": "Boring Car"},
                    {"ns": 14, "title": "Category:Group B drivers"}]}}
            if p.get("prop") == "pageviews":
                return {"query": {"pages": [{"title": "Fantasy Rally Car X", "pageviews": {"a": 50}},
                                            {"title": "Boring Car", "pageviews": {"a": 10}}]}}
            if "extracts" in p.get("prop", ""):
                t = p["titles"]
                wt = WIKITEXT if t == "Fantasy Rally Car X" else "{{Infobox automobile|name=x}}"
                return {"query": {"pages": [{"title": t, "extract": "...",
                                             "revisions": [{"slots": {"main": {"content": wt}}}]}]}}
            raise AssertionError(url)

        orig, net.http = net.http, fake_http
        os.environ.pop("ANTHROPIC_API_KEY", None)
        try:
            added = discover.run(self.bot)
        finally:
            net.http = orig
        self.assertEqual([c["nev"] for c in added], ["Fantasy Rally Car X"])
        self.assertTrue(added[0]["auto"])
        auto = json.load(open(os.path.join(self.tmp, "cars", "auto.json"), encoding="utf-8"))
        self.assertEqual(len(auto), 1)
        state = json.load(open(os.path.join(self.tmp, "cars", "felfedezes_allapot.json"), encoding="utf-8"))
        self.assertEqual(state["megvizsgalt"]["Boring Car"], "kevés adat")
        # reload picks auto cars up, and a second run finds nothing new
        bot2 = core.Bot(self.tmp)
        self.assertIn(added[0]["id"], bot2.cars)
        net.http = fake_http
        try:
            self.assertEqual(discover.run(bot2), [])
        finally:
            net.http = orig


if __name__ == "__main__":
    unittest.main()
