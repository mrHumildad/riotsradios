const stations = [
          { name: 'Radio Contrabanda', "webpage": "https://www.contrabanda.org/","icon": "https://www.contrabanda.org/favicon.ico", location: 'Barcelona, Spain', url: 'https://radiobot.radioslibres.info/listen/contrabanda_fm/radio.mp3'},
            { name: "Radio Arrebato", location: "Guadalajara, Spain", icon: "https://pbs.twimg.com/profile_images/1972705258380959744/pczIzr5G_400x400.jpg", webpage:"https://www.radioarrebato.net/", url: "http://srv0510.emisorasonline.com:8025/stream" },
            { name: "Radio Caroline", location: "United Kingdom", url: "http://sc6.radiocaroline.net:8040/;", icon: "https://www.radio.net/175/carolineinternational.png?version=e6efa3da5668fd004163801d934235246ca1c111", webpage:"https://www.radiocaroline.co.uk/#home.html" },
            { name: "Eguzki Irratia", location: "Pamplona, Basque Country", url: "https://streaming.eguzki.eus/eguzki.mp3" , icon: "https://eguzki.eus/wp-content/themes/eguzki/images/logo.png", webpage:"https://eguzki.eus/" },
            { name: "FM La Boca", location: "Buenos Aires, Argentina",
             url: "https://s24.myradiostream.com:14984/listen.mp3",
             webpage:"https://www.fmlaboca.com.ar/",
             icon: "https://www.fmlaboca.com.ar/wp-content/themes/noticias/images/logo.png"

            },
            { name: "Radio Bip", location: "Besançon, France", url: "https://radiobip.fr/web?",
              webpage: "https://radiobip.fr/site/",
              icon:"https://radiobip.fr/site/wp-content/uploads/2016/04/logo-2.png"
             },
            { name: "FM La Tribu", location: "Buenos Aires, Argentina", 
            url: "https://icecast.zeclogiccloud.com.de/fmlatribu",
          icon: ""
          },
            { name: "Radiofabrik", location: "Salzburg, Austria", url: "http://stream.radiofabrik.at:8000/rf_low.mp3" },
            { name: "Radio QK", location: "Asturias, Spain", url: "https://icecast.radioqk.org:8443/radioqk_master.mp3" },
            { name: "Radio Pica", location: "Barcelona, Spain", icon:"https://scontent-mxp1-1.cdninstagram.com/v/t51.2885-19/469336993_1246498276630351_572288452485412234_n.jpg?stp=dst-jpg_s320x320_tt6&efg=eyJ2ZW5jb2RlX3RhZyI6InByb2ZpbGVfcGljLmRqYW5nby4xMDgwLmMyIn0&_nc_ht=scontent-mxp1-1.cdninstagram.com&_nc_cat=107&_nc_oc=Q6cZ2gF27iIWfT3eyY0SKat3xdYi850ivIc0LgmKqzQpaalW5RtvdxFq_k2KlV69acsaRls&_nc_ohc=jmR7nTxjQ88Q7kNvwGFUbb2&_nc_gid=XQaNasJGbs__6jiye6AlyQ&edm=AOQ1c0wBAAAA&ccb=7-5&oh=00_Af4qCoQWDdPfBBHXNCkeipL1uCqyHpMzq4AgGv_pUhFQCA&oe=6A0E3A86&_nc_sid=8b3546", url: "https://stream-177.zeno.fm/mgqsp0utpwzuv?zt=eyJhbGciOiJIUzI1NiJ9.eyJzdHJlYW0iOiJtZ3FzcDB1dHB3enV2IiwiaG9zdCI6InN0cmVhbS0xNzcuemVuby5mbSIsInJ0dGwiOjUsImp0aSI6IndvbW0zcjFPUThpYjBEZ3NqRUJVSnciLCJpYXQiOjE3Nzg5Mjg2NjMsImV4cCI6MTc3ODkyODcyM30.TAfhGVejd2BsTAmfrwrdPMPk3f1KaRXNpKG9Ze3D-Uw" },
  {
    "name": "Radio Enlace",
    "location": "Madrid (España)",
    "webpage": "https://www.radioenlace.org/",
    "url": "https://cervera.eldialdigital.com:25121/stream",
    "icon": "https://graph.facebook.com/radioenlacemadrid/picture?width=200&height=200"
  },
  {
    "name": "Radio la Granja",
    "location": "Zaragoza (España)",
    "webpage": "https://radiolagranja.org/",
    "url": "https://radiobot.radioslibres.info/listen/radio_la_granja/rlg.mp3",
    "icon": "https://radiobot.radioslibres.info/static/uploads/radio_la_granja/album_art.1681753022.jpg"
  },
  {
    "name": "Irola Irratia",
    "location": "Bilbao (España)",
    "webpage": "https://irolairratia.org/",
    "url": "https://giss.tv:666/irola.mp3",
    "icon": "https://i0.wp.com/irolairratia.org/wp-content/uploads/2026/01/cropped-Irola-Irratia-con-web-e1767740165928.png?w=250&ssl=1"
  },

  {
    "name": "Radio Malva",
    "location": "Valencia (España)",
    "webpage": "https://radiomalva.org/",
    "url": "http://radiomalva.ddns.net:8000/rmbc.ogg",
    "icon": "https://radiomalva.org/wp-content/uploads/2022/03/radiomalva-logo-w.jpg"
  },
  {
    "name": "Ké Huelga Radio",
    "location": "México",
    "webpage": "https://kehuelga.net/",
    "url": "http://kehuelga.net:8000/radio.mp3",
    "icon": "https://kehuelga.net/IMG/logo/nadanosdetiene.jpg?1687580303"
  },



  {
    "name": "Ràdio Klara",
    "location": "Valencia (España)",
    "webpage": "https://radioklara.org/",
    "url": "https://cervera.eldialdigital.com:21111/stream",
    "icon": "https://pbs.twimg.com/profile_images/1187485621/logok_400x400.png"
  },
  {
    "name": "Radio Libertaire",
    "location": "París (Francia)",
    "webpage": "https://radio-libertaire.org/",
    "url": "http://media.radio-libertaire.org:8080/radiolib.mp3",
    "icon": "https://radio-libertaire.org/images/bandRL.jpg"
  },

  {
    "name": "Radio Topo",
    "location": "Zaragoza (España)",
    "webpage": "https://radiotopo.org/",
    "url": "https://radiobot.radioslibres.info/listen/radio_topo/radio96.mp3",
    "icon": "https://www.radiotopo.org/wp-content/uploads/2024/05/logo-radio-topo-1.png"
  },
  {
    "name": "Radio Vallekas",
    "location": "Madrid (España)",
    "webpage": "https://radiovallekas.org/",
    "url": "https://radio.radiobot.org/listen/rvk/rvk.mp3",
    "icon": "https://www.radiovallekas.org/wp-content/uploads/2020/11/indice.png"
  },


  {
    "name": "Radio Utopía",
    "location": "San Sebastián de los Reyes (España)",
    "webpage": "https://radioutopia.org.es/",
    "url": "http://streaming.radioutopia.es:8000/radio-utopia.mp3",
    "icon": "https://www.radioutopia.org.es/wp-content/uploads/2024/12/cropped-Radio-Utopia-150x150.png"
  },
  {
    "name": "Radio Carcoma",
    "location": "Madrid (España)",
    "webpage": "https://www.radiocarcoma.com/",
    "url": "https://live.radiocarcoma.com/main",
    "icon": "https://www.radiocarcoma.com/wp-content/uploads/logo_Small.jpg"
  },

  {
    "name": "Radio Mistelera",
    "location": "Marina Alta (España)",
    "webpage": "https://radiomistelera.blogspot.com/",
    "url": "https://radiobot.radioslibres.info/listen/radio_mistelera/radio.mp3",
    "icon": "https://radiobot.radioslibres.info/static/uploads/album_art.1640255872.jpg"
  },
  {
    "name": "Radio Almaina",
    "location": "Granada (España)",
    "webpage": "https://radioalmaina.org/",
    "url": "https://radiobot.radioslibres.info/listen/radio_almaina/radio.mp3",
    "icon": "https://img-static.ivoox.com/index.php?w=175&url=https://static-1.ivoox.com/canales/4/4/6/e/446e4bcfdda2af1dec4be8062f5ffec0_XXL.jpg&f=webp",
  }
  ]

