// ==========================================================================
// ŠTOK I KRILO — barometar cena prozora, početno merenje
//
// Do 5. 10. 2026. je ceo barometar stajao u index.html. Posledice su bile tri:
// novo merenje je tražilo izmenu koda, istorija se nije nigde skupljala, a na
// strani je 5. oktobra i dalje pisalo „BROJ 0 · AVGUST 2026" uz tvrdnju da se
// meri svakog meseca.
//
// Sada merenja stoje u bazi, jedno po krugu. Raspon je [min, max] u evrima po
// komadu, sa ugradnjom. Izvori su agregatori ponuda izvođača; kolona „bez
// ugradnje" ne postoji jer javni izvori za nju nisu uporedivi.
// ==========================================================================
export const BAROMETAR_SEME = {
  "baza": "RS",
  "klase": {
    "E": "Klasa E: Uw 1,3 · dvoslojno staklo · standardni profil · osnovni okov",
    "S": "Klasa S: Uw 1,0 · troslojno staklo · energetski profil · osnovni okov",
    "P": "Klasa P: Uw ≤ 0,8 · troslojno staklo · energetski profil · sigurnosni okov"
  },
  "elementi": [
    {
      "id": "B1",
      "naziv": "Jednokrilni prozor",
      "dim": "90 × 120 cm"
    },
    {
      "id": "B2",
      "naziv": "Dvokrilni prozor",
      "dim": "140 × 140 cm"
    },
    {
      "id": "B3",
      "naziv": "Balkonska vrata",
      "dim": "90 × 210 cm"
    }
  ],
  "trzista": [
    {
      "kod": "RS",
      "ime": "Srbija",
      "izvor": "daibau.rs"
    },
    {
      "kod": "HR",
      "ime": "Hrvatska",
      "izvor": "emajstor.hr"
    },
    {
      "kod": "SI",
      "ime": "Slovenija",
      "izvor": "mojmojster.net"
    }
  ],
  "rupe": [
    {
      "trziste": "Bosna i Hercegovina",
      "ima": "Cene po stavkama u KM, ali na starijem setu dimenzija (100×100, 120×140, 110×210) i bez podele na klase.",
      "treba": "B1, B2, B3 u tačnim dimenzijama i klase E/S/P."
    },
    {
      "trziste": "Severna Makedonija",
      "ima": "Samo agregat 85–156 €/m², bez cena po stavkama.",
      "treba": "Kompletna korpa."
    },
    {
      "trziste": "Crna Gora",
      "ima": "Nema regionalnog agregatora — samo cenovnici pojedinačnih firmi, 200–380 €/m².",
      "treba": "Kompletna korpa."
    }
  ],
  "merenja": [
    {
      "broj": 0,
      "mesec": "Avgust 2026",
      "datum": "2026-08-15",
      "podaci": {
        "RS": {
          "B1": {
            "E": [
              135,
              160
            ],
            "S": [
              150,
              180
            ],
            "P": [
              150,
              190
            ]
          },
          "B2": {
            "E": [
              215,
              300
            ],
            "S": [
              230,
              330
            ],
            "P": [
              230,
              330
            ]
          },
          "B3": {
            "E": [
              210,
              300
            ],
            "S": [
              230,
              330
            ],
            "P": [
              230,
              330
            ]
          }
        },
        "HR": {
          "B1": {
            "E": [
              200,
              260
            ],
            "S": [
              225,
              280
            ],
            "P": [
              240,
              320
            ]
          },
          "B2": {
            "E": [
              380,
              480
            ],
            "S": [
              430,
              550
            ],
            "P": [
              430,
              600
            ]
          },
          "B3": {
            "E": [
              280,
              350
            ],
            "S": [
              330,
              460
            ],
            "P": [
              350,
              510
            ]
          }
        },
        "SI": {
          "B1": {
            "E": [
              350,
              500
            ],
            "S": [
              400,
              600
            ],
            "P": [
              520,
              800
            ]
          },
          "B2": {
            "E": [
              750,
              1000
            ],
            "S": [
              900,
              1200
            ],
            "P": [
              1300,
              2000
            ]
          },
          "B3": {
            "E": [
              800,
              1000
            ],
            "S": [
              900,
              1200
            ],
            "P": [
              1200,
              1900
            ]
          }
        }
      },
      "zastavice": {
        "RS|B2|P": "izvor ne razlikuje S i P",
        "RS|B3|P": "izvor ne razlikuje S i P",
        "HR|B2|E": "ispravljen obrnut raspon iz izvora"
      }
    }
  ]
};
