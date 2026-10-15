# Livrable 2 — dossier d’architecture et budget

## 1. Objet et statut

Ce dossier détaille l’architecture AWS cible de **Clienta**, l’application de gestion de clients du Livrable 1. Il complète le schéma de haut niveau validé dans ce livrable.

- Diagramme éditable : [architecture.drawio](./architecture.drawio) (ouvrir avec [diagrams.net](https://app.diagrams.net/)).
- Région : `us-east-1`.
- Infrastructure cible : AWS Academy Learner Lab, déployée en Infrastructure as Code (Terraform).
- Statut : **conception**, à valider dans le Learner Lab avant tout déploiement. Aucun service AWS ni alerte budgétaire n’a été créé par ce document.

Le navigateur charge le front-end statique servi par Node.js/Express sur les instances EC2. Le front appelle l’API sur le même domaine (`/api/customers`); l’API persiste les fiches dans MySQL sur RDS. Le front et l’API sont deux composants du code, mais partagent le même processus Node.js et la couche applicative, conformément au Livrable 1.

## 2. Schéma détaillé

Le fichier Draw.io représente les flux réseau, les deux zones de disponibilité, les sous-réseaux, les groupes de sécurité, le stockage, la supervision et le plan de contrôle Terraform.

### Plan d’adressage proposé

| Zone | Sous-réseau | CIDR proposé | Rôle |
|---|---|---:|---|
| `us-east-1a` | Public | `10.0.1.0/24` | Nœud de l’ALB |
| `us-east-1b` | Public | `10.0.2.0/24` | Nœud de l’ALB |
| `us-east-1a` | Privé applicatif | `10.0.11.0/24` | Instance EC2 du groupe Auto Scaling |
| `us-east-1b` | Privé applicatif | `10.0.12.0/24` | Instance EC2 du groupe Auto Scaling |
| `us-east-1a` | Privé données | `10.0.21.0/24` | Instance RDS MySQL (Single-AZ au départ) |
| `us-east-1b` | Privé données | `10.0.22.0/24` | Sous-réseau du groupe de sous-réseaux RDS |

Les plages sont des propositions sans chevauchement avec le VPC par défaut; elles pourront être ajustées avant le premier `terraform apply`. Une passerelle Internet et des tables de routage explicites sont prévues. Les sous-réseaux applicatifs n’ont pas de route directe vers Internet.

### Flux autorisés

| Source | Destination | Port / protocole | Règle |
|---|---|---|---|
| Utilisateur Internet | ALB | TCP 80 | Seul point d’entrée public de l’application |
| Groupe de sécurité ALB | Groupe de sécurité applicatif | TCP 8080 | Trafic acheminé vers les instances enregistrées |
| Groupe de sécurité applicatif | Groupe de sécurité RDS | TCP 3306 | MySQL; aucune connexion Internet ou accès public à la base |
| Instance applicative | S3 via endpoint de passerelle | HTTPS 443 | Téléchargement de l’artefact et accès aux objets autorisés |
| Agent de journaux applicatif | CloudWatch Logs via endpoint privé | HTTPS 443 | Publication des journaux sans NAT Gateway |

Aucune règle entrante SSH n’est prévue. L’ALB vérifie `GET /health`; cette route atteste que le processus Node.js répond. La route `/health/db` reste disponible pour le diagnostic, mais n’est pas le contrôle de santé de l’ALB afin d’éviter de retirer simultanément toutes les instances lors d’une panne RDS.

## 3. Services AWS et justification

| Service | Usage dans Clienta | Choix et limites |
|---|---|---|
| IAM `LabRole` / `LabInstanceProfile` | Autoriser les opérations prévues pour Terraform et les instances | Rôles imposés par AWS Academy; aucun rôle ou policy personnalisé n’est supposé disponible. Vérifier les permissions effectives avant le déploiement. |
| VPC, sous-réseaux, tables de routage, Internet Gateway | Isoler et segmenter les couches | Un VPC dédié en `us-east-1`, sous-réseaux publics et privés sur deux AZ. |
| Security Groups | Contrôler les communications entre couches | ALB → application sur 8080; application → RDS sur 3306. Aucun accès public direct à EC2 ou RDS. |
| Application Load Balancer | Point d’entrée unique, distribution et contrôle de santé | Présent dans les deux sous-réseaux publics; cible le port 8080. HTTP/80 est retenu pour la démonstration, car la gestion de certificats n’est pas incluse dans le périmètre autorisé actuel. |
| Auto Scaling Group et Launch Template | Remplacer une instance en panne et répartir le calcul sur deux AZ | Minimum et capacité désirée de 2 instances `t3.micro`; maximum initial proposé de 4, à confirmer par un test de charge et le budget. Configuration reproductible par Launch Template et User Data. |
| EC2 et EBS gp3 | Héberger le processus Node.js et les fichiers statiques | Application sans état local; volume racine chiffré. Une instance remplacée est reconstruite depuis l’artefact S3. |
| RDS for MySQL | Persister la table `customer` | Instance privée `db.t3.micro`, Single-AZ pour limiter le coût, sauvegardes automatiques avec rétention d’un jour. Le groupe de sous-réseaux couvre deux AZ, mais le déploiement initial n’active pas Multi-AZ. |
| S3 | Stocker l’artefact de déploiement, et éventuellement un objet de configuration chiffré | Accès public bloqué; buckets séparés pour les artefacts et l’état Terraform. Versionnement et chiffrement à activer. Accès d’instance limité par le rôle et la politique d’endpoint effectivement disponibles. |
| Endpoint de passerelle S3 | Permettre l’accès privé à S3 depuis les sous-réseaux applicatifs | Évite une NAT Gateway et permet de récupérer un artefact déjà empaqueté avec ses dépendances. Aucun `npm install` depuis Internet au démarrage. |
| Endpoints d’interface CloudWatch Logs / Monitoring | Acheminer journaux et métriques depuis les instances privées | Option de conception à valider dans le Learner Lab et dans le budget : ces endpoints peuvent être facturés par AZ. Si bloqués, documenter et chiffrer une solution de repli avant de changer l’architecture. |
| CloudWatch | Centraliser les journaux, les métriques et les alarmes | Tableau de bord proposé; alarmes sur les cibles ALB non saines et le CPU EC2. Les métriques automatiques et les journaux applicatifs doivent être testés après déploiement. |
| AWS Budgets (si autorisé par le Learner Lab) | Alerter sur la consommation | Cibles proposées : alertes à 45 USD (75 % du plafond de 60 USD) et 54 USD (90 %). La création et la livraison de l’alerte restent à vérifier; voir §7. |

## 4. Décisions d’architecture

### D1 — ALB public, application et données privées

Tout le trafic utilisateur entre par l’ALB. Les instances ne reçoivent aucun trafic entrant direct d’Internet; RDS n’a pas d’adresse publique. Les Security Groups utilisent des références entre groupes plutôt que des plages ouvertes pour les flux applicatifs.

### D2 — Deux instances minimales et deux zones

L’Auto Scaling Group démarre avec deux instances, une par AZ, pour respecter la cible du Livrable 1 de rester disponible après la perte d’une instance. Le plafond de quatre instances est une hypothèse initiale, non une capacité de charge garantie. La cible de 50 requêtes/s doit être démontrée par un test; les instances `t3.micro` peuvent nécessiter un redimensionnement qui devra être justifié par son coût.

### D3 — RDS Single-AZ pour le budget, avec restauration testée

Le Livrable 1 fixe une perte de données maximale de 24 heures. Les sauvegardes automatiques quotidiennes et une rétention d’un jour répondent à cet objectif pendant que l’instance existe, mais une instance Single-AZ ne résiste pas à la perte de sa zone. Avant chaque destruction hebdomadaire, un snapshot manuel doit être créé et conservé; le prochain déploiement restaure la base à partir du dernier snapshot validé. Sans cette étape, la destruction de RDS peut supprimer les sauvegardes et l’objectif de perte maximale de 24 heures n’est pas garanti. Le coût des snapshots conservés est à ajouter au calculateur AWS.

### D4 — Pas de NAT Gateway

La NAT Gateway n’est pas retenue : son coût permanent est disproportionné pour le crédit du groupe et elle ne figure pas dans la liste des services autorisés. L’artefact applicatif est empaqueté à l’avance et récupéré depuis S3 via un endpoint de passerelle. Les endpoints nécessaires à CloudWatch sont à vérifier; si les permissions ou le coût les rendent impossibles, consigner le repli dans ce dossier avant de l’utiliser.

### D5 — Secrets et état Terraform hors du dépôt

Les identifiants AWS temporaires ne sont jamais enregistrés dans Git. L’état Terraform partagé est conservé dans un bucket S3 privé créé par un bootstrap séparé et préservé lors de la destruction de l’infrastructure applicative. Le mot de passe RDS est généré hors du dépôt; son passage à l’instance doit employer un mécanisme chiffré et autorisé par `LabRole`. Le mécanisme décrit au Livrable 1 (objet S3 chiffré) n’est utilisable qu’après vérification des permissions et de la protection de la clé de chiffrement dans le Learner Lab.

### D6 — Reconstruction et mise en service

Terraform décrit les ressources; Le Launch Template et le User Data configurent les instances à chaque démarrage. Le script de construction prépare une archive versionnée avec les dépendances Node.js, puis la publie dans le bucket d’artefacts. Le processus démarre via `systemd`, écoute sur le port 8080 et expose `/health`. Avant chaque destruction, le script d’exploitation doit enregistrer un snapshot RDS et vérifier qu’il est disponible; au déploiement suivant, la base est restaurée depuis le dernier snapshot validé. Les étapes exactes de publication, reconstruction et destruction seront ajoutées au README et aux scripts lors du Livrable 3.

## 5. Haute disponibilité, sécurité et supervision prévues

- **Perte d’une instance** : l’ALB retire une cible non saine; l’Auto Scaling Group la remplace. La deuxième instance maintient le service disponible.
- **Perte d’une AZ applicative** : l’autre instance reste dans le groupe cible. Cette propriété ne garantit pas la disponibilité de RDS Single-AZ.
- **Données** : RDS demeure privé, chiffrement au repos prévu et sauvegardes automatiques activées. La restauration n’est validée qu’après un exercice réel.
- **Réseau** : seul l’ALB accepte les requêtes publiques; aucune règle SSH ou MySQL publique.
- **Journaux** : journaux Node.js centralisés dans CloudWatch Logs; éviter d’y écrire des secrets ou des données personnelles complètes.
- **Alarmes fonctionnelles à créer et tester** :
  1. `UnHealthyHostCount >= 1` sur le groupe cible ALB.
  2. `CPUUtilization > 80 %` sur une instance EC2 pendant 5 minutes (seuil initial à calibrer).
- **Tableau de bord** : état des cibles ALB, requêtes et erreurs ALB, CPU EC2 et métriques RDS pertinentes.
- **Chiffrement en transit** : la conception initiale utilise HTTP/80 sur l’ALB pour rester dans le périmètre de services du sujet. Ce choix convient à une démonstration pédagogique, pas à une mise en production avec données réelles. Toute évolution vers HTTPS doit d’abord valider l’autorisation et la disponibilité du service de certificats dans le compte.

## 6. Estimation de coût préliminaire

Les tarifs ci-dessous sont des **hypothèses de calcul**, pas un devis exporté d’AWS Pricing Calculator. Ils doivent être remplacés ou confirmés dans le calculateur AWS pour `us-east-1` et le compte porteur avant remise définitive. L’estimation suppose 14 séances de 3 heures (42 heures de ressources), destruction après chaque séance, deux EC2 minimales, et au plus deux EC2 supplémentaires pendant toute la durée estimée.

| Poste | Hypothèse de prix utilisée | Estimation sur 42 h |
|---|---:|---:|
| 2 EC2 `t3.micro` Linux | 2 × 0,0104 USD/h | 0,87 USD |
| ALB | 0,0225 USD/h | 0,95 USD |
| Capacité ALB | Réserve d’1 LCU à 0,008 USD/h | 0,34 USD |
| RDS MySQL `db.t3.micro`, Single-AZ | 0,017 USD/h | 0,71 USD |
| Endpoints CloudWatch Logs et Monitoring | 2 endpoints × 2 AZ × 0,01 USD/AZ-h | 1,68 USD |
| EBS gp3 (2 × 8 Go) et RDS (20 Go) | Stockage proratisé sur 42 h | 0,21 USD |
| S3 (5 Go) | Stockage proratisé sur 42 h | 0,01 USD |
| Jusqu’à 2 EC2 supplémentaires | 2 × 0,0104 USD/h × 42 h | 0,87 USD |
| **Sous-total indicatif** | Hors taxes, transfert, snapshots RDS conservés et dépassement des quotas | **5,64 USD** |

Prévoir une enveloppe de travail d’environ **15 USD** pour absorber les variations et les postes omis; cette valeur n’est pas une garantie de facturation et exclut le coût des snapshots RDS conservés, qui dépend de la taille et de la durée de conservation. Une exécution continue 24 h/24 n’est pas compatible avec le budget du groupe : aux mêmes hypothèses, les seuls postes horaires atteignent environ 79 USD sur 730 heures, avant stockage et autres frais. La destruction en fin de séance et la vérification qu’aucune ressource facturée ne reste active sont donc obligatoires.

**À faire dans AWS Pricing Calculator avant validation** : choisir `US East (N. Virginia)`, saisir les heures réelles prévues, confirmer les types d’instance disponibles dans le Lab, inclure l’ALB et ses LCU, les endpoints d’interface effectivement retenus, le stockage RDS/EBS/S3, les snapshots RDS conservés et le volume de journaux. Joindre l’export ou une capture du résultat au dossier final.

## 7. Alerte de budget et vérifications AWS Academy

Le plafond déclaré au Livrable 1 est de **60 USD pour le groupe** (30 USD par étudiant); les 100 USD disponibles correspondent au crédit total des deux membres et ne changent pas le plafond choisi.

Le cahier des charges signale que les opérations AWS Budgets peuvent être bloquées dans le Learner Lab. L’alerte n’est donc **pas présentée comme configurée**. Avant de conclure le Livrable 2 :

1. Vérifier dans le compte porteur si AWS Budgets et la création d’alertes sont autorisés.
2. Si autorisé, créer une alerte de coût avec des notifications à 45 USD et 54 USD, en vérifiant que la période couvre bien le budget de 60 USD du projet. Si AWS Budgets ne permet qu’une période mensuelle, fixer un plafond mensuel cohérent avec le calendrier des déploiements et suivre séparément le cumul du semestre.
3. Si bloqué, consigner la restriction dans `docs/compte-aws.md` et appliquer le suivi manuel du crédit Learner Lab à chaque séance; ne pas prétendre qu’une alerte AWS a été créée.
4. Tester la disponibilité de l’ALB, de l’Auto Scaling Group, de RDS, de S3, des endpoints VPC et de CloudWatch dans la région `us-east-1`, avec le rôle `LabRole`.
5. Si un composant est refusé ou facturé au-delà de l’enveloppe, mettre à jour le schéma et l’estimation avant de poursuivre.

## 8. Points à confirmer avant l’implémentation

- Autorisations Learner Lab pour ALB, ASG, RDS, endpoints VPC, CloudWatch et AWS Budgets.
- Plafond réel de dépense et durée hebdomadaire des ressources par séance.
- Permissions effectives de `LabRole` et `LabInstanceProfile`, notamment pour S3 et les journaux CloudWatch.
- Présence d’un mécanisme de notification utilisable pour les alarmes et l’alerte budgétaire.
- Capacité à soutenir 50 requêtes/s avec deux `t3.micro` et seuils d’Auto Scaling à retenir après test.
- Confirmation qu’une restauration RDS avec 24 h de perte maximale satisfait les exigences de démonstration.
