import QtQuick 2.0;
import calamares.slideshow 1.0;

Presentation {
    id: presentation

    Slide {
        Rectangle { anchors.fill: parent; color: "#f3f6fb" }
        Text {
            anchors.centerIn: parent
            horizontalAlignment: Text.AlignHCenter
            font.pixelSize: 26
            color: "#25324a"
            text: "Installation de ClairOS en cours…\n\nLa technologie, simplement."
        }
    }
}
