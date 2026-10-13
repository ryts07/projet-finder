# Recette d'acceptation — Finder, étape 9

**Projet :** Finder — Sprint 1  
**Date :** à renseigner après exécution  
**Testeur :** à renseigner  
**Environnement :** base MySQL de test seedée, API Express/Prisma.

| Référence | Scénario à vérifier | Résultat | Date | Testeur |
|---|---|---|---|---|
| TA-001 | GET /health renvoie 200 et `{ "ok": true }` | À tester | — | — |
| TA-002 | GET /hotels renvoie les 3 hôtels du seed | À tester | — | — |
| TA-003 | GET /hotels/:id : hôtel existant puis 404 sur absent | À tester | — | — |
| TA-004 | Recherche : 31 chambres sans l'id 4 du 10 au 12 octobre 2026, puis 32 du 11 au 13 | À tester | — | — |
| TA-005 | Inscription voyageur sans divulgation du mot de passe | À tester | — | — |
| TA-006 | Connexion JWT puis consultation du profil voyageur | À tester | — | — |
| TA-007 | Réservation interdite sans jeton ou avec rôle hôtelier | À tester | — | — |
| TA-008 | Création, modification, suppression d'une chambre temporaire | À tester | — | — |
| TA-009 | Création d'une réservation en attente et lecture dans /reservations/mine | À tester | — | — |
| TA-010 | Confirmation hôtelier puis annulation par le voyageur | À tester | — | — |

**Résultat Vitest :** à reporter après exécution (`npm.cmd test`).  
**Couverture :** à reporter après `npm.cmd run test:coverage`.  
**Swagger :** vérifier `http://localhost:3000/docs`.

> Ne pas indiquer « réussi » avant la vérification effective. Les données temporaires sont créées puis nettoyées par les tests.
